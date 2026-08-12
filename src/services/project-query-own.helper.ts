import {
  Prisma,
  ProjectInstallmentStatus,
  ProjectPhaseStatus,
  ProjectStatus,
  UnitResponsibleType,
  UrgentType,
  UserRole,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { OPS_DEPT_ID, PROCUREMENT_WORKFLOW_TYPES } from '../lib/constant';
import { isHeadOfSupplyDept, isSuperAdmin } from '../lib/permissions';
import { OwnProjectTab, OwnProjectTabEnum } from '../schemas/project.schema';
import { AuthPayload } from '../types/auth.type';
import { PaginatedProjects } from '../types/project.type';

type SupplyProgressRole =
  | typeof UserRole.GENERAL_STAFF
  | typeof UserRole.HEAD_OF_UNIT
  | typeof UserRole.DOCUMENT_STAFF;

type OwnRole = SupplyProgressRole | typeof UserRole.FINANCE_STAFF;

type RoleScope = {
  role: OwnRole;
  where: Prisma.ProjectWhereInput;
};

type UnitScope = {
  id: string;
  type: UnitResponsibleType[];
};

const PROJECT_SELECT = {
  id: true,
  receive_no: true,
  title: true,
  status: true,
  responsible_unit: {
    select: {
      name: true,
    },
  },
  procurement_progress: true,
  contract_progress: true,
  requesting_unit: {
    select: {
      id: true,
      name: true,
      department: { select: { name: true, id: true } },
    },
  },
  budget: true,
  procurement_type: true,
  current_workflow_type: true,
  assignee_procurement: { select: { id: true, full_name: true } },
  assignee_contract: { select: { id: true, full_name: true } },
  is_urgent: true,
  expected_approval_date: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.ProjectSelect;

const URGENT_TAB: Partial<Record<OwnProjectTab, UrgentType>> = {
  urgent: UrgentType.URGENT,
  very_urgent: UrgentType.VERY_URGENT,
  super_urgent: UrgentType.SUPER_URGENT,
};

const ACTION_TAB_UNION: Record<OwnRole, OwnProjectTab[]> = {
  [UserRole.GENERAL_STAFF]: [
    'waiting_accept',
    'need_action',
    'rejected',
    'waiting_others',
  ],
  [UserRole.HEAD_OF_UNIT]: [
    'waiting_approval',
    'waiting_others',
    'waiting_cancel',
  ],
  [UserRole.DOCUMENT_STAFF]: ['waiting_proposal', 'waiting_signature'],
  [UserRole.FINANCE_STAFF]: [
    'waiting_finance_export',
    'waiting_edit',
    'waiting_close_project',
  ],
};

const URGENT_TABS: OwnProjectTab[] = ['urgent', 'very_urgent', 'super_urgent'];

const ROLE_TAB_UNION: Record<OwnRole, OwnProjectTab[]> = {
  [UserRole.GENERAL_STAFF]: [
    ...ACTION_TAB_UNION[UserRole.GENERAL_STAFF],
    ...URGENT_TABS,
  ],
  [UserRole.HEAD_OF_UNIT]: [
    ...ACTION_TAB_UNION[UserRole.HEAD_OF_UNIT],
    ...URGENT_TABS,
  ],
  [UserRole.DOCUMENT_STAFF]: [
    ...ACTION_TAB_UNION[UserRole.DOCUMENT_STAFF],
    ...URGENT_TABS,
  ],
  [UserRole.FINANCE_STAFF]: [
    ...ACTION_TAB_UNION[UserRole.FINANCE_STAFF],
    ...URGENT_TABS,
  ],
};

const NON_COMPLETED_PHASE_STATUSES = Object.values(ProjectPhaseStatus).filter(
  (status) => status !== ProjectPhaseStatus.COMPLETED
) as ProjectPhaseStatus[];

const emptyWhere = (): Prisma.ProjectWhereInput => ({ id: { in: [] } });

const orWhere = (
  clauses: Prisma.ProjectWhereInput[]
): Prisma.ProjectWhereInput =>
  clauses.length === 0
    ? emptyWhere()
    : clauses.length === 1
      ? clauses[0]
      : { OR: clauses };

const andWhere = (
  ...clauses: Prisma.ProjectWhereInput[]
): Prisma.ProjectWhereInput => {
  const filtered = clauses.filter((clause) => Object.keys(clause).length > 0);
  return filtered.length === 0
    ? {}
    : filtered.length === 1
      ? filtered[0]
      : { AND: filtered };
};

const unique = <T>(values: T[]) => Array.from(new Set(values));

const hasSupplyRole = (user: AuthPayload, role: UserRole) =>
  user.roles.some((r) => r.role === role && r.dept_id === OPS_DEPT_ID);

const getSupplyRoleUnitIds = (user: AuthPayload, role: UserRole) =>
  unique(
    user.roles
      .filter((r) => r.role === role && r.dept_id === OPS_DEPT_ID)
      .map((r) => r.unit_id)
      .filter((id): id is string => Boolean(id))
  );

const getUnitsByRole = async (
  user: AuthPayload,
  roles: UserRole[]
): Promise<Map<UserRole, UnitScope[]>> => {
  const unitIds = unique(
    roles.flatMap((role) => getSupplyRoleUnitIds(user, role))
  );

  const units =
    unitIds.length > 0
      ? await prisma.unit.findMany({
          where: { id: { in: unitIds } },
          select: { id: true, type: true },
        })
      : [];

  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  return new Map(
    roles.map((role) => [
      role,
      getSupplyRoleUnitIds(user, role)
        .map((id) => unitById.get(id))
        .filter((unit): unit is UnitScope => Boolean(unit)),
    ])
  );
};

const buildGeneralStaffScope = (
  user: AuthPayload,
  units: UnitScope[]
): Prisma.ProjectWhereInput | null => {
  const workflowTypes = unique(units.flatMap((unit) => unit.type));
  const procurementWorkflowTypes = workflowTypes.filter(
    (type) => type !== UnitResponsibleType.CONTRACT
  );
  const clauses: Prisma.ProjectWhereInput[] = [];

  if (procurementWorkflowTypes.length > 0) {
    clauses.push(
      andWhere(
        { current_workflow_type: { in: procurementWorkflowTypes } },
        { assignee_procurement: { some: { id: user.id } } }
      )
    );
  }

  if (workflowTypes.includes(UnitResponsibleType.CONTRACT)) {
    clauses.push(
      andWhere(
        { current_workflow_type: UnitResponsibleType.CONTRACT },
        { assignee_contract: { some: { id: user.id } } }
      )
    );
  }

  return clauses.length > 0 ? orWhere(clauses) : null;
};

const buildHeadOfUnitScope = (
  units: UnitScope[]
): Prisma.ProjectWhereInput | null => {
  const clauses = units
    .filter((unit) => unit.type.length > 0)
    .map((unit) =>
      andWhere(
        { responsible_unit_id: unit.id },
        { current_workflow_type: { in: unit.type } }
      )
    );

  return clauses.length > 0 ? orWhere(clauses) : null;
};

const progressFieldStatus = (
  field: 'procurement_progress' | 'contract_progress',
  role: SupplyProgressRole,
  status: ProjectPhaseStatus
): Prisma.ProjectWhereInput =>
  ({
    [field]: {
      path: [role, 'status'],
      equals: status,
    },
  }) as Prisma.ProjectWhereInput;

const progressStatusWhere = (
  role: SupplyProgressRole,
  statuses: ProjectPhaseStatus[]
): Prisma.ProjectWhereInput =>
  orWhere(
    statuses.flatMap((status) => [
      andWhere(
        { current_workflow_type: { in: PROCUREMENT_WORKFLOW_TYPES } },
        progressFieldStatus('procurement_progress', role, status)
      ),
      andWhere(
        { current_workflow_type: UnitResponsibleType.CONTRACT },
        progressFieldStatus('contract_progress', role, status)
      ),
    ])
  );

const buildRoleScopes = async (user: AuthPayload): Promise<RoleScope[]> => {
  const roleUnits = await getUnitsByRole(user, [
    UserRole.GENERAL_STAFF,
    UserRole.HEAD_OF_UNIT,
  ]);
  const scopes: RoleScope[] = [];

  if (hasSupplyRole(user, UserRole.GENERAL_STAFF)) {
    const generalScope = buildGeneralStaffScope(
      user,
      roleUnits.get(UserRole.GENERAL_STAFF) ?? []
    );
    if (generalScope) {
      scopes.push({ role: UserRole.GENERAL_STAFF, where: generalScope });
    }
  }

  if (hasSupplyRole(user, UserRole.HEAD_OF_UNIT)) {
    const headScope = buildHeadOfUnitScope(
      roleUnits.get(UserRole.HEAD_OF_UNIT) ?? []
    );
    if (headScope) {
      scopes.push({ role: UserRole.HEAD_OF_UNIT, where: headScope });
    }
  }

  if (hasSupplyRole(user, UserRole.DOCUMENT_STAFF)) {
    scopes.push({ role: UserRole.DOCUMENT_STAFF, where: {} });
  }

  if (hasSupplyRole(user, UserRole.FINANCE_STAFF)) {
    scopes.push({ role: UserRole.FINANCE_STAFF, where: {} });
  }

  return scopes;
};

const roleAllTabWhere = (scope: RoleScope): Prisma.ProjectWhereInput =>
  orWhere(
    ACTION_TAB_UNION[scope.role]
      .map((roleTab) => roleTabWhere(scope, roleTab))
      .filter((clause): clause is Prisma.ProjectWhereInput => Boolean(clause))
  );

const roleTabWhere = (
  scope: RoleScope,
  tab: OwnProjectTab
): Prisma.ProjectWhereInput | null => {
  const urgentStatus = URGENT_TAB[tab];
  if (urgentStatus) {
    return andWhere(roleAllTabWhere(scope), { is_urgent: urgentStatus });
  }

  if (tab === 'all') {
    return roleAllTabWhere(scope);
  }

  if (scope.role === UserRole.GENERAL_STAFF) {
    if (tab === 'waiting_accept') {
      return andWhere(scope.where, { status: ProjectStatus.WAITING_ACCEPT });
    }
    if (tab === 'need_action') {
      return andWhere(
        scope.where,
        { status: ProjectStatus.IN_PROGRESS },
        orWhere([
          progressStatusWhere(scope.role, [ProjectPhaseStatus.IN_PROGRESS]),
          andWhere(
            { current_workflow_type: { in: PROCUREMENT_WORKFLOW_TYPES } },
            progressStatusWhere(scope.role, [ProjectPhaseStatus.COMPLETED]),
            progressStatusWhere(UserRole.HEAD_OF_UNIT, [
              ProjectPhaseStatus.COMPLETED,
            ]),
            progressStatusWhere(UserRole.DOCUMENT_STAFF, [
              ProjectPhaseStatus.COMPLETED,
            ]),
            { project_installments: { none: {} } }
          ),
          andWhere(
            { current_workflow_type: UnitResponsibleType.CONTRACT },
            progressStatusWhere(scope.role, [ProjectPhaseStatus.COMPLETED]),
            progressStatusWhere(UserRole.HEAD_OF_UNIT, [
              ProjectPhaseStatus.COMPLETED,
            ]),
            progressStatusWhere(UserRole.DOCUMENT_STAFF, [
              ProjectPhaseStatus.COMPLETED,
            ]),
            { contract_completed_at: null },
          ),
        ])
      );
    }
    if (tab === 'rejected') {
      return andWhere(
        scope.where,
        { status: ProjectStatus.IN_PROGRESS },
        progressStatusWhere(scope.role, [ProjectPhaseStatus.REJECTED])
      );
    }
    if (tab === 'waiting_others') {
      return andWhere(
        scope.where,
        { status: ProjectStatus.IN_PROGRESS },
        progressStatusWhere(scope.role, [
          ProjectPhaseStatus.WAITING_APPROVAL,
          ProjectPhaseStatus.COMPLETED,
        ]),
        progressStatusWhere(
          UserRole.HEAD_OF_UNIT,
          NON_COMPLETED_PHASE_STATUSES
        ),
        progressStatusWhere(
          UserRole.DOCUMENT_STAFF,
          NON_COMPLETED_PHASE_STATUSES
        )
      );
    }
  }

  if (scope.role === UserRole.HEAD_OF_UNIT) {
    if (tab === 'waiting_approval') {
      return andWhere(
        scope.where,
        { status: ProjectStatus.IN_PROGRESS },
        progressStatusWhere(scope.role, [ProjectPhaseStatus.WAITING_APPROVAL])
      );
    }
    if (tab === 'waiting_cancel') {
      return andWhere(scope.where, { status: ProjectStatus.WAITING_CANCEL });
    }
    if (tab === 'waiting_others') {
      return andWhere(
        scope.where,
        { status: ProjectStatus.IN_PROGRESS },
        progressStatusWhere(UserRole.GENERAL_STAFF, [
          ProjectPhaseStatus.REJECTED,
        ]),
        progressStatusWhere(scope.role, [ProjectPhaseStatus.NOT_STARTED])
      );
    }
  }

  if (scope.role === UserRole.DOCUMENT_STAFF) {
    if (tab === 'waiting_proposal') {
      return andWhere(
        scope.where,
        { status: ProjectStatus.IN_PROGRESS },
        progressStatusWhere(scope.role, [ProjectPhaseStatus.WAITING_PROPOSAL])
      );
    }
    if (tab === 'waiting_signature') {
      return andWhere(
        scope.where,
        { status: ProjectStatus.IN_PROGRESS },
        progressStatusWhere(scope.role, [ProjectPhaseStatus.WAITING_SIGNATURE])
      );
    }
  }

  if (scope.role === UserRole.FINANCE_STAFF) {
    if (tab === 'waiting_finance_export') {
      return andWhere(
        scope.where,
        { status: ProjectStatus.IN_PROGRESS },
        { current_workflow_type: UnitResponsibleType.CONTRACT },
        {
          project_installments: {
            some: {
              status: ProjectInstallmentStatus.WAITING_EXPORT,
            },
            none: {
              status: ProjectInstallmentStatus.REQUEST_EDIT,
            },
          },
        }
      );
    }

    if (tab === 'waiting_edit') {
      return andWhere(
        scope.where,
        { status: ProjectStatus.IN_PROGRESS },
        { current_workflow_type: UnitResponsibleType.CONTRACT },
        {
          project_installments: {
            some: {
              status: ProjectInstallmentStatus.REQUEST_EDIT,
            },
          },
        }
      );
    }

    if (tab === 'waiting_close_project') {
      return andWhere(scope.where, {
        status: ProjectStatus.WAITING_CLOSE,
      });
    }
  }

  return null;
};

const broadAccessWhere = (
  user: AuthPayload,
  tab: OwnProjectTab
): Prisma.ProjectWhereInput | null => {
  const hasBroadAccess = isSuperAdmin(user) || isHeadOfSupplyDept(user);
  if (!hasBroadAccess) {
    return null;
  }

  const urgentStatus = URGENT_TAB[tab];
  if (urgentStatus) {
    return { is_urgent: urgentStatus };
  }

  return tab === 'all' ? {} : null;
};

const ownProjectWhereClause = async (
  user: AuthPayload,
  tab: OwnProjectTab
): Promise<Prisma.ProjectWhereInput> => {
  const broadWhere = broadAccessWhere(user, tab);
  if (broadWhere) {
    return broadWhere;
  }

  const scopes = await buildRoleScopes(user);

  const clauses = scopes
    .map((scope) => roleTabWhere(scope, tab))
    .filter((clause): clause is Prisma.ProjectWhereInput => Boolean(clause));

  return orWhere(clauses);
};

export const getOwnProjects = async (
  user: AuthPayload,
  page: number,
  limit: number,
  tab: OwnProjectTab
): Promise<PaginatedProjects> => {
  const whereClause = await ownProjectWhereClause(user, tab);

  const [projects, total] = await prisma.$transaction([
    prisma.project.findMany({
      where: whereClause,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ receive_no: 'desc' }],
      select: PROJECT_SELECT,
    }),
    prisma.project.count({ where: whereClause }),
  ]);

  return {
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    data: projects,
  } as PaginatedProjects;
};

const getApplicableTabs = (user: AuthPayload): OwnProjectTab[] => {
  if (isSuperAdmin(user) || isHeadOfSupplyDept(user)) {
    return OwnProjectTabEnum.options;
  }

  const roleTabs = user.roles
    .filter((r) => r.dept_id === OPS_DEPT_ID)
    .flatMap((r) => ROLE_TAB_UNION[r.role as OwnRole] ?? []);

  if (roleTabs.length === 0) {
    return [];
  }

  return ['all', ...unique(roleTabs)];
};

export const getOwnProjectsTotal = async (
  user: AuthPayload
): Promise<Record<string, number>> => {
  const tabs = getApplicableTabs(user);
  if (tabs.length === 0) {
    return {};
  }

  const whereEntries = await Promise.all(
    tabs.map(async (tab) => ({
      tab,
      where: await ownProjectWhereClause(user, tab),
    }))
  );

  const counts = await prisma.$transaction(
    whereEntries.map((entry) => prisma.project.count({ where: entry.where }))
  );

  const result: Record<string, number> = {};
  whereEntries.forEach((entry, idx) => {
    result[entry.tab] = counts[idx];
  });

  return result;
};
