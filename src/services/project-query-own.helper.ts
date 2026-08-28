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
import { OPS_DEPT_ID, PROCUREMENT_WORKFLOW_TYPES } from '../utils/constant';
import { isHeadOfSupplyDept, isSuperAdmin } from '../utils/permissions';
import {
  GetOwnProjectsQuery,
} from '../schemas/project.schema';
import { OwnProjectTab } from '../types/project.type';
import { bangkokDayEndUtc, bangkokDayStartUtc } from '../utils/date';
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
  requesting_dept: {
    select: {
      id: true,
      name: true,
    },
  },
  requesting_unit: {
    select: {
      id: true,
      name: true,
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
  project_installments: {
    select: {
      status: true,
    },
  },
} satisfies Prisma.ProjectSelect;

const ACTION_TAB_UNION: Record<OwnRole, OwnProjectTab[]> = {
  [UserRole.GENERAL_STAFF]: [
    OwnProjectTab.WAITING_ACCEPT,
    OwnProjectTab.NEED_ACTION,
    OwnProjectTab.REJECTED,
    OwnProjectTab.WAITING_OTHERS,
    OwnProjectTab.COMPLETED,
  ],
  [UserRole.HEAD_OF_UNIT]: [
    OwnProjectTab.WAITING_APPROVAL,
    OwnProjectTab.WAITING_OTHERS,
    OwnProjectTab.WAITING_CANCEL,
  ],
  [UserRole.DOCUMENT_STAFF]: [OwnProjectTab.WAITING_PROPOSAL, OwnProjectTab.WAITING_SIGNATURE],
  [UserRole.FINANCE_STAFF]: [
    OwnProjectTab.WAITING_FINANCE_EXPORT,
    OwnProjectTab.WAITING_EDIT,
    OwnProjectTab.WAITING_CLOSE_PROJECT,
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

  clauses.push(
    andWhere(
      { current_workflow_type: UnitResponsibleType.CONTRACT },
      { assignee_contract: { some: { id: user.id } } }
    )
  );

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
  if (tab === 'urgent') {
    return andWhere(roleAllTabWhere(scope), {
      is_urgent: { not: UrgentType.NORMAL },
    });
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
            { contract_completed_at: null }
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
    if (tab === 'completed') {
      return andWhere(
        scope.where,
        orWhere([
          { status: ProjectStatus.CLOSED },
          { procurement_completed_at: { not: null } },
          { contract_completed_at: { not: null } },
        ])
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

const buildSearchFilter = (search?: string): Prisma.ProjectWhereInput => {
  if (!search?.trim()) {
    return {};
  }

  const searchTerm = search.trim();
  return {
    OR: [
      {
        receive_no: {
          contains: searchTerm,
          mode: Prisma.QueryMode.insensitive,
        },
      },
      {
        title: {
          contains: searchTerm,
          mode: Prisma.QueryMode.insensitive,
        },
      },
      {
        assignee_procurement: {
          some: {
            full_name: {
              contains: searchTerm,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        },
      },
      {
        assignee_contract: {
          some: {
            full_name: {
              contains: searchTerm,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        },
      },
    ],
  };
};

const buildCompletedDateFilter = (
  dateFrom?: Date,
  dateTo?: Date
): Prisma.ProjectWhereInput => {
  if (!dateFrom && !dateTo) {
    return {};
  }

  const dateFilter: Prisma.DateTimeFilter = {};
  if (dateFrom) {
    dateFilter.gte = bangkokDayStartUtc(dateFrom);
  }
  if (dateTo) {
    dateFilter.lte = bangkokDayEndUtc(dateTo);
  }

  return orWhere([
    andWhere(
      { current_workflow_type: { in: PROCUREMENT_WORKFLOW_TYPES } },
      { procurement_completed_at: dateFilter }
    ),
    andWhere(
      { current_workflow_type: UnitResponsibleType.CONTRACT },
      { contract_completed_at: dateFilter }
    ),
  ]);
};

const ownProjectWhereClause = async (
  user: AuthPayload,
  query: GetOwnProjectsQuery
): Promise<Prisma.ProjectWhereInput> => {
  const tab = query.tab ?? OwnProjectTab.ALL;

  const scopes = await buildRoleScopes(user);
  const clauses = scopes
    .map((scope) => roleTabWhere(scope, tab))
    .filter((clause): clause is Prisma.ProjectWhereInput => Boolean(clause));
  const baseWhere = orWhere(clauses);

  const andClauses: Prisma.ProjectWhereInput[] = [baseWhere];

  const searchWhere = buildSearchFilter(query.search);
  if (Object.keys(searchWhere).length > 0) {
    andClauses.push(searchWhere);
  }

  if (tab === 'completed') {
    const dateWhere = buildCompletedDateFilter(
      query.dateFrom,
      query.dateTo
    );
    if (Object.keys(dateWhere).length > 0) {
      andClauses.push(dateWhere);
    }
  }

  return andWhere(...andClauses);
};

const resolveOwnProjectStatus = (
  project: {
    status: ProjectStatus;
    current_workflow_type: UnitResponsibleType;
    procurement_progress?: unknown;
    contract_progress?: unknown;
    project_installments?: Array<{ status: ProjectInstallmentStatus }>;
  },
  user: AuthPayload,
  tab: OwnProjectTab
): string => {
  if (tab !== 'all' && tab !== 'urgent') {
    return tab.toUpperCase();
  }

  const roles = user.roles
    .filter((r) => r.dept_id === OPS_DEPT_ID)
    .map((r) => r.role as OwnRole);

  const activeProgress = (
    project.current_workflow_type === UnitResponsibleType.CONTRACT
      ? project.contract_progress
      : project.procurement_progress
  ) as Record<string, { status?: ProjectPhaseStatus }> | undefined;

  if (roles.includes(UserRole.GENERAL_STAFF)) {
    if (project.status === ProjectStatus.WAITING_ACCEPT) {
      return 'WAITING_ACCEPT';
    }
    const staffStatus = activeProgress?.[UserRole.GENERAL_STAFF]?.status;
    const headStatus = activeProgress?.[UserRole.HEAD_OF_UNIT]?.status;
    const docStatus = activeProgress?.[UserRole.DOCUMENT_STAFF]?.status;

    if (staffStatus === ProjectPhaseStatus.REJECTED) {
      return 'REJECTED';
    }
    if (
      (staffStatus === ProjectPhaseStatus.WAITING_APPROVAL ||
        staffStatus === ProjectPhaseStatus.COMPLETED) &&
      (headStatus !== ProjectPhaseStatus.COMPLETED ||
        docStatus !== ProjectPhaseStatus.COMPLETED)
    ) {
      return 'WAITING_OTHERS';
    }
    return 'NEED_ACTION';
  }

  if (roles.includes(UserRole.HEAD_OF_UNIT)) {
    if (project.status === ProjectStatus.WAITING_CANCEL) {
      return 'WAITING_CANCEL';
    }
    const staffStatus = activeProgress?.[UserRole.GENERAL_STAFF]?.status;
    const headStatus = activeProgress?.[UserRole.HEAD_OF_UNIT]?.status;

    if (
      staffStatus === ProjectPhaseStatus.REJECTED &&
      headStatus === ProjectPhaseStatus.NOT_STARTED
    ) {
      return 'WAITING_OTHERS';
    }
    if (headStatus === ProjectPhaseStatus.WAITING_APPROVAL) {
      return 'WAITING_APPROVAL';
    }
  }

  if (roles.includes(UserRole.DOCUMENT_STAFF)) {
    const docStatus = activeProgress?.[UserRole.DOCUMENT_STAFF]?.status;
    if (docStatus === ProjectPhaseStatus.WAITING_PROPOSAL) {
      return 'WAITING_PROPOSAL';
    }
    if (docStatus === ProjectPhaseStatus.WAITING_SIGNATURE) {
      return 'WAITING_SIGNATURE';
    }
  }

  if (roles.includes(UserRole.FINANCE_STAFF)) {
    if (project.status === ProjectStatus.WAITING_CLOSE) {
      return 'WAITING_CLOSE_PROJECT';
    }
    const hasRequestEdit = project.project_installments?.some(
      (i) => i.status === ProjectInstallmentStatus.REQUEST_EDIT
    );
    if (hasRequestEdit) {
      return 'WAITING_EDIT';
    }
    const hasWaitingExport = project.project_installments?.some(
      (i) => i.status === ProjectInstallmentStatus.WAITING_EXPORT
    );
    if (hasWaitingExport) {
      return 'WAITING_FINANCE_EXPORT';
    }
  }

  return String(project.status);
};

export const getOwnProjects = async (
  user: AuthPayload,
  page: number,
  limit: number,
  query: GetOwnProjectsQuery
): Promise<PaginatedProjects> => {
  const tab = query.tab ?? OwnProjectTab.ALL;

  const whereClause = await ownProjectWhereClause(user, query);

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

  const data = projects.map((project) => ({
    title: project.title,
    id: project.id,
    status: resolveOwnProjectStatus(project, user, tab),
    receive_no: project.receive_no,
    procurement_type: project.procurement_type,
    expected_approval_date: project.expected_approval_date,
    requesting_dept: project.requesting_dept,
    requesting_unit: project.requesting_unit,
    assignee:
      project.current_workflow_type === UnitResponsibleType.CONTRACT
        ? project.assignee_contract
        : project.assignee_procurement,
  }));

  return {
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    data,
  } as unknown as PaginatedProjects;
};

const getApplicableTabs = (user: AuthPayload): OwnProjectTab[] => {
  if (isSuperAdmin(user) || isHeadOfSupplyDept(user)) {
    return Object.values(OwnProjectTab);
  }

  const roleTabs = user.roles
    .filter((r) => r.dept_id === OPS_DEPT_ID)
    .flatMap((r) => ACTION_TAB_UNION[r.role as OwnRole] ?? []);

  if (roleTabs.length === 0) {
    return [OwnProjectTab.ALL, OwnProjectTab.URGENT];
  }

  return [OwnProjectTab.ALL, ...unique(roleTabs), OwnProjectTab.URGENT];
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
      where: await ownProjectWhereClause(user, { tab }),
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
