import {
  Prisma,
  ProjectStatus,
  LogActionType,
  UserRole,
  UnitResponsibleType,
  UrgentType,
  ProcurementType,
  ProjectPhaseStatus,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { ForbiddenError, NotFoundError } from '../lib/errors';
import {
  haveSupplyPermission,
  getDeptIdsForUser,
  isHeadOfSupplyDept,
  isHeadOfSupplyUnit,
  isSuperAdmin,
} from '../lib/permissions';
import { AuthPayload } from '../types/auth.type';
import {
  PaginatedProjects,
  ProjectsListResponse,
  StaffWorkload,
  SummaryResponse,
  UnitWorkload,
  WorkloadStatsResponse,
} from '../types/project.type';
import { CONTRACT_UNIT_ID, OPS_DEPT_ID, PROC1_UNIT_ID, PROC2_UNIT_ID, WORKLOAD_STATUSES } from '../lib/constant';
import { ProjectFilterQuery } from '../schemas/project.schema';

const SORTABLE_FIELDS = new Set([
  'receive_no',
  'title',
  'created_at',
  'status',
  'procurement_status',
  'contract_status',
]);

const buildWhereClause = (
  user: AuthPayload,
  filters?: ProjectFilterQuery
): Prisma.ProjectWhereInput => {
  const and: Prisma.ProjectWhereInput[] = [];

  if (!haveSupplyPermission(user)) {
    and.push({ requesting_dept_id: { in: getDeptIdsForUser(user) } });
  }

  const hasExplicitDate = Boolean(filters?.dateFrom || filters?.dateTo);
  if (!hasExplicitDate) {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setHours(0, 0, 0, 0);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    and.push({ created_at: { gte: sixMonthsAgo } });
  } else {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (filters?.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      dateFilter.gte = fromDate;
    }
    if (filters?.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      dateFilter.lte = toDate;
    }
    and.push({ created_at: dateFilter });
  }

  if (filters?.search?.trim()) {
    const searchTerm = filters.search.trim();
    and.push({
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
      ],
    });
  }

  if (filters?.title?.trim()) {
    const titleSearchTerm = filters.title.trim();
    and.push({
      title: { contains: titleSearchTerm, mode: Prisma.QueryMode.insensitive },
    });
  }

  if (filters?.fiscalYear !== undefined) {
    and.push({
      budget_plans: {
        some: { budget_year: String(filters.fiscalYear) },
      },
    });
  }
  if (filters?.procurementType?.length) {
    and.push({
      procurement_type: { in: filters.procurementType as ProcurementType[] },
    });
  }
  if (filters?.status?.length) {
    and.push({ status: { in: filters.status as ProjectStatus[] } });
  }
  if (filters?.procurementStatus?.length) {
    and.push({
      procurement_status: {
        in: filters.procurementStatus as ProjectPhaseStatus[],
      },
    });
  }
  if (filters?.contractStatus?.length) {
    and.push({
      contract_status: { in: filters.contractStatus as ProjectPhaseStatus[] },
    });
  }
  if (filters?.urgentStatus?.length) {
    and.push({ is_urgent: { in: filters.urgentStatus as UrgentType[] } });
  }
  if (filters?.units?.length) {
    and.push({ requesting_unit_id: { in: filters.units } });
  }

  // ── Assignees (OR across both relations + myTasks shortcut) ───────────────
  const assigneeIds = new Set<string>(filters?.assignees ?? []);
  if (filters?.myTasks) {
    if (isHeadOfSupplyDept(user)) {
      and.push({ responsible_unit_id: { in: [PROC1_UNIT_ID, PROC2_UNIT_ID, CONTRACT_UNIT_ID] } });
    } else if (isHeadOfSupplyUnit(user)) {
      const unitIds = user.roles
        .filter((r) => r.role === UserRole.HEAD_OF_UNIT && r.unit_id)
        .map((r) => r.unit_id as string);
      if (unitIds.length > 0) {
        and.push({ responsible_unit_id: { in: unitIds } });
      }
    }

    assigneeIds.add(user.id);
  }

  if (assigneeIds.size > 0) {
    const ids = [...assigneeIds];
    and.push({
      OR: [
        { assignee_procurement: { some: { id: { in: ids } } } },
        { assignee_contract: { some: { id: { in: ids } } } },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
};

const buildOrderBy = (filters?: ProjectFilterQuery) => {
  if (filters?.sortBy && SORTABLE_FIELDS.has(filters.sortBy)) {
    return [
      {
        [filters.sortBy]: filters.sortOrder ?? 'desc',
      } as Prisma.ProjectOrderByWithRelationInput,
    ];
  }
  return [{ receive_no: 'desc' as Prisma.SortOrder }];
};

export const listProjects = async (
  user: AuthPayload,
  page: number,
  limit: number,
  filters?: ProjectFilterQuery
): Promise<PaginatedProjects> => {
  const skip = (page - 1) * limit;
  const where = buildWhereClause(user, filters);
  const orderBy = buildOrderBy(filters);

  const [projects, total] = await prisma.$transaction([
    prisma.project.findMany({
      where,
      include: {
        requesting_dept: { select: { id: true, name: true } },
        requesting_unit: { select: { id: true, name: true } },
        assignee_procurement: { select: { id: true, full_name: true } },
        assignee_contract: { select: { id: true, full_name: true } },
      },
      skip,
      take: limit,
      orderBy,
    }),
    prisma.project.count({ where }),
  ]);

  return {
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    data: projects,
  };
};

export const getById = async (user: AuthPayload, id: string): Promise<any> => {
  const haveAccess =
    haveSupplyPermission(user) ||
    (await prisma.project.count({
      where: {
        id,
        requesting_dept_id: { in: getDeptIdsForUser(user) },
      },
    })) > 0;

  if (!haveAccess) {
    throw new ForbiddenError('You do not have access to this project');
  }

  return await prisma.$transaction(async (tx) => {
    const projectData = await tx.project.findUnique({
      where: { id },
      include: {
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
        assignee_procurement: {
          select: {
            id: true,
            full_name: true,
          },
        },
        assignee_contract: {
          select: {
            id: true,
            full_name: true,
          },
        },
        creator: {
          select: {
            id: true,
            full_name: true,
          },
        },
        project_cancellation: {
          where: { is_active: true },
          include: {
            requester: { select: { id: true, full_name: true, roles: true } },
            approver: { select: { id: true, full_name: true, roles: true } },
          },
        },
      },
    });
    if (!projectData) {
      throw new NotFoundError('Project not found');
    }

    const project = {
      id: projectData.id,
      procurement_type: projectData.procurement_type,
      current_workflow_type: projectData.current_workflow_type,
      is_urgent: projectData.is_urgent,
      title: projectData.title,
      description: projectData.description,
      budget: projectData.budget,
      status: projectData.status,
      procurement_status: {
        status: projectData.procurement_status,
        step: projectData.procurement_step,
      },
      contract_status: {
        status: projectData.contract_status,
        step: projectData.contract_step,
      },
      receive_no: projectData.receive_no,
      less_no: projectData.less_no,
      pr_no: projectData.pr_no,
      po_no: projectData.po_no,
      contract_no: projectData.contract_no,
      migo_no: projectData.migo_no,
      expected_approval_date: projectData.expected_approval_date,
      created_at: projectData.created_at,
      updated_at: projectData.updated_at,
      vendor: {
        name: projectData.vendor_name,
        tax_id: projectData.vendor_tax_id,
        email: projectData.vendor_email,
      },
      requester: {
        dept_id: projectData.requesting_dept.id,
        dept_name: projectData.requesting_dept.name,
        unit_id: projectData.requesting_unit?.id ?? null,
        unit_name: projectData.requesting_unit?.name ?? null,
      },
      creator: {
        id: projectData.creator.id,
        full_name: projectData.creator.full_name,
      },
      assignee_procurement: projectData.assignee_procurement.map((u) => ({
        id: u.id,
        full_name: u.full_name,
      })),
      assignee_contract: projectData.assignee_contract.map((u) => ({
        id: u.id,
        full_name: u.full_name,
      })),
      cancellation: projectData.project_cancellation
        ? projectData.project_cancellation.map((c) => ({
            reason: c.reason,
            is_cancelled: c.is_cancelled,
            requester: c.requester,
            approver: c.approver,
            requested_at: c.requested_at,
            approved_at: c.approved_at,
          }))
        : null,
    };

    return project;
  });
};

export const getUnassignedProjectsByUnit = async (
  user: AuthPayload,
  unitId: string
): Promise<ProjectsListResponse> => {
  const userUnitIds = user.roles
    .map((r) => r.unit_id)
    .filter((id): id is string => Boolean(id));

  if (!isHeadOfSupplyDept(user) && !isSuperAdmin(user)) {
    if (userUnitIds.length > 0) {
      if (!userUnitIds.includes(unitId)) {
        throw new ForbiddenError(
          'You do not have permission to access this unit'
        );
      }
    } else {
      throw new ForbiddenError(
        'You do not have permission to access this unit'
      );
    }
  }

  const unit = await prisma.unit.findUnique({
    where: {
      id: unitId,
    },
    select: { type: true },
  });
  if (!unit) {
    throw new NotFoundError('Unit not found');
  }
  const where: any = {
    status: { in: [ProjectStatus.UNASSIGNED] },
    current_workflow_type: {
      in: unit.type,
    },
  };

  const [projects, total] = await prisma.$transaction([
    prisma.project.findMany({
      where: where,
      orderBy: [{ status: 'asc' }, { receive_no: 'desc' }],
      select: {
        id: true,
        receive_no: true,
        title: true,
        status: true,
        requesting_unit: {
          select: {
            name: true,
            department: { select: { name: true, id: true } },
          },
        },
        budget: true,
        procurement_type: true,
        current_workflow_type: true,
        is_urgent: true,
        expected_approval_date: true,
        created_at: true,
      },
    }),
    prisma.project.count({ where }),
  ]);

  return {
    total,
    data: projects,
  };
};

export const getAssignedProjects = async (
  user: AuthPayload,
  targetDate: Date
): Promise<ProjectsListResponse> => {
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  let where: any = {
    AND: [
      {
        status: {
          in: [
            ProjectStatus.WAITING_ACCEPT,
            ProjectStatus.IN_PROGRESS,
            ProjectStatus.CANCELLED,
          ],
        },
      },
      {
        OR: [
          { status: { equals: ProjectStatus.WAITING_ACCEPT } },
          {
            project_histories: {
              some: {
                AND: [
                  {
                    OR: [
                      { action: LogActionType.STATUS_UPDATE },
                      { action: LogActionType.ASSIGNEE_UPDATE },
                    ],
                  },
                  { changed_at: { gte: startOfDay, lte: endOfDay } },
                  {
                    OR: [
                      {
                        new_value: {
                          path: ['status'],
                          equals: ProjectStatus.IN_PROGRESS,
                        },
                      },
                      {
                        new_value: {
                          path: ['status'],
                          equals: ProjectStatus.CANCELLED,
                        },
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
    ],
  };

  if (user.roles.some((r) => r.role === UserRole.HEAD_OF_UNIT)) {
    const unitIds = user.roles
      .map((r) => r.unit_id)
      .filter((id): id is string => Boolean(id));
    if (unitIds.length === 0) {
      throw new NotFoundError('Unit not found');
    }

    const unit = await prisma.unit.findMany({
      where: {
        id: {
          in: unitIds,
        },
      },
      select: { type: true },
    });
    if (unit.length === 0) {
      throw new NotFoundError('Unit not found');
    }

    where.AND.push({
      current_workflow_type: {
        in: unit.flatMap((u) => u.type),
      },
    });
  } else if (user.roles.some((r) => r.role === UserRole.GENERAL_STAFF)) {
    where.AND.push({
      OR: [
        { assignee_procurement: { some: { id: user.id } } },
        { assignee_contract: { some: { id: user.id } } },
      ],
    });
  }

  const [projects, total] = await prisma.$transaction([
    prisma.project.findMany({
      where: where,
      orderBy: [{ status: 'asc' }, { receive_no: 'desc' }],
      select: {
        id: true,
        receive_no: true,
        title: true,
        status: true,
        requesting_unit: {
          select: {
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
      },
    }),
    prisma.project.count({ where }),
  ]);

  return {
    total,
    data: projects.map((project) => {
      const assigneeField =
        project.current_workflow_type === UnitResponsibleType.CONTRACT
          ? 'assignee_contract'
          : 'assignee_procurement';
      const assignee = (project as any)[assigneeField];
      return {
        ...project,
        assignee: assignee.map((u: any) => ({
          id: u.id,
          full_name: u.full_name,
        })),
        assignee_procurement: undefined,
        assignee_contract: undefined,
      };
    }),
  };
};

export const getWaitingCancellationProjects = async (
  user: AuthPayload,
  unitId: string
): Promise<ProjectsListResponse> => {
  const userUnitIds = user.roles
    .map((r) => r.unit_id)
    .filter((id): id is string => Boolean(id));

  if (!isHeadOfSupplyDept(user) && !isSuperAdmin(user)) {
    if (userUnitIds.length > 0) {
      if (!userUnitIds.includes(unitId)) {
        throw new ForbiddenError(
          'You do not have permission to access this unit'
        );
      }
    } else {
      throw new ForbiddenError(
        'You do not have permission to access this unit'
      );
    }
  }

  const where: Prisma.ProjectWhereInput = {
    status: ProjectStatus.WAITING_CANCEL,
    responsible_unit_id: unitId,
  };

  const [projects, total] = await prisma.$transaction([
    prisma.project.findMany({
      where,
      orderBy: [{ receive_no: 'desc' }],
      select: {
        id: true,
        receive_no: true,
        title: true,
        status: true,
        requesting_unit: {
          select: {
            name: true,
            department: { select: { name: true, id: true } },
          },
        },
        budget: true,
        procurement_type: true,
        current_workflow_type: true,
        is_urgent: true,
        expected_approval_date: true,
        created_at: true,
        updated_at: true,
        project_cancellation: {
          where: { is_active: true },
          select: {
            reason: true,
            requester: {
              select: {
                id: true,
                full_name: true,
              },
            },
          },
        },
      },
    }),
    prisma.project.count({ where }),
  ]);

  return {
    total,
    data: projects,
  };
};

export const getOwnProjects = async (
  user: AuthPayload,
  page: number,
  limit: number
): Promise<PaginatedProjects> => {
  const skip = (page - 1) * limit;
  const where = {
    OR: [
      { assignee_procurement: { some: { id: user.id } } },
      { assignee_contract: { some: { id: user.id } } },
    ],
  };

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      skip: skip,
      take: limit,
      orderBy: [{ receive_no: 'desc' }],
      select: {
        id: true,
        receive_no: true,
        title: true,
        status: true,
        requesting_unit: {
          select: {
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
      },
    }),
    prisma.project.count({ where }),
  ]);

  return {
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    data: projects,
  };
};

const aggregateByStaff = (
  projects: Array<{
    current_workflow_type: UnitResponsibleType;
    assignee_procurement: { id: string; full_name: string }[];
    assignee_contract: { id: string; full_name: string }[];
  }>
): Map<string, StaffWorkload> => {
  const map = new Map<string, StaffWorkload>();

  for (const project of projects) {
    const assignees =
      project.current_workflow_type === UnitResponsibleType.CONTRACT
        ? project.assignee_contract
        : project.assignee_procurement;

    for (const user of assignees) {
      const existing = map.get(user.id);
      if (existing) {
        existing.workload += 1;
      } else {
        map.set(user.id, {
          user_id: user.id,
          full_name: user.full_name,
          workload: 1,
        });
      }
    }
  }

  return map;
};

export const getWorkload = async (
  user: AuthPayload,
  filterUnitId?: string
): Promise<WorkloadStatsResponse> => {
  // ── HEAD_OF_DEPARTMENT (or SUPER_ADMIN/ADMIN): return all units ────────────
  if (isHeadOfSupplyDept(user) || isSuperAdmin(user)) {
    const unitWhere: any = { dept_id: OPS_DEPT_ID };
    if (filterUnitId) unitWhere.id = filterUnitId;

    const units = await prisma.unit.findMany({
      where: unitWhere,
      select: { id: true, name: true, type: true },
      orderBy: { id: 'asc' },
    });

    const projects = await prisma.project.findMany({
      where: {
        status: { in: WORKLOAD_STATUSES },
        responsible_unit_id: { in: units.map((u) => u.id) },
      },
      select: {
        responsible_unit_id: true,
        current_workflow_type: true,
        assignee_procurement: { select: { id: true, full_name: true } },
        assignee_contract: { select: { id: true, full_name: true } },
      },
    });

    const result: UnitWorkload[] = units.map((unit) => {
      const unitProjects = projects.filter(
        (p) => p.responsible_unit_id === unit.id
      );
      const staffMap = aggregateByStaff(unitProjects);
      return {
        unit_id: unit.id,
        unit_name: unit.name,
        staff: Array.from(staffMap.values()).sort(
          (a, b) => b.workload - a.workload
        ),
      };
    });
    return {
      role: UserRole.HEAD_OF_DEPARTMENT,
      units: result,
    };
  }
  // ── HEAD_OF_UNIT: return staff workload within own unit ────────────────────
  else if (isHeadOfSupplyUnit(user) && !isHeadOfSupplyDept(user)) {
    const unitIds = user.roles
      .filter((r) => r.role === UserRole.HEAD_OF_UNIT && r.unit_id)
      .map((r) => r.unit_id as string);

    if (unitIds.length === 0) {
      throw new ForbiddenError('No unit assigned to this user');
    }

    const targetUnitId = unitIds[0];

    const unit = await prisma.unit.findUnique({
      where: { id: targetUnitId },
      select: { id: true, name: true },
    });

    const projects = await prisma.project.findMany({
      where: {
        status: { in: WORKLOAD_STATUSES },
        responsible_unit_id: targetUnitId,
      },
      select: {
        current_workflow_type: true,
        assignee_procurement: { select: { id: true, full_name: true } },
        assignee_contract: { select: { id: true, full_name: true } },
      },
    });

    const staffMap = aggregateByStaff(projects);

    return {
      role: UserRole.HEAD_OF_UNIT,
      unit_id: unit!.id,
      unit_name: unit!.name,
      staff: Array.from(staffMap.values()).sort(
        (a, b) => b.workload - a.workload
      ),
    };
  }

  throw new ForbiddenError('You do not have permission to view workload stats');
};

export const getSummaryCards = async (
  user: AuthPayload
): Promise<SummaryResponse> => {
  const isSupply = haveSupplyPermission(user);
  if (isSupply) {
    const [
      total,
      unassigned,
      waiting_accept,
      in_progress,
      closed,
      cancelled,
      urgent,
    ] = await prisma.$transaction([
      prisma.project.count(),
      prisma.project.count({ where: { status: ProjectStatus.UNASSIGNED } }),
      prisma.project.count({ where: { status: ProjectStatus.WAITING_ACCEPT } }),
      prisma.project.count({
        where: {
          status: {
            in: [
              ProjectStatus.IN_PROGRESS,
              ProjectStatus.WAITING_CANCEL,
              ProjectStatus.REQUEST_EDIT,
            ],
          },
        },
      }),
      prisma.project.count({ where: { status: ProjectStatus.CLOSED } }),
      prisma.project.count({ where: { status: ProjectStatus.CANCELLED } }),
      prisma.project.count({
        where: {
          is_urgent: {
            in: [
              UrgentType.URGENT,
              UrgentType.VERY_URGENT,
              UrgentType.SUPER_URGENT,
            ],
          },
        },
      }),
    ]);

    return {
      role: 'SUPPLY',
      total,
      [ProjectStatus.UNASSIGNED]: unassigned,
      [ProjectStatus.WAITING_ACCEPT]: waiting_accept,
      [ProjectStatus.IN_PROGRESS]: in_progress,
      [ProjectStatus.CLOSED]: closed,
      [ProjectStatus.CANCELLED]: cancelled,
      [UrgentType.URGENT]: urgent,
    };
  }

  const deptIds = getDeptIdsForUser(user);
  const baseWhere = { requesting_dept_id: { in: deptIds } };

  const [total, not_started, in_progress, closed, cancelled, urgent] =
    await prisma.$transaction([
      prisma.project.count({ where: baseWhere }),
      prisma.project.count({
        where: {
          ...baseWhere,
AND: [
            {
          status: {
            in: [ProjectStatus.UNASSIGNED, ProjectStatus.WAITING_ACCEPT],
          },
},
            {
              procurement_status: {
                in: [ProjectPhaseStatus.NOT_STARTED],
              },
            },
          ],
        },
      }),
      prisma.project.count({
        where: {
          ...baseWhere,
OR: [
            {
          status: {
            in: [
              ProjectStatus.IN_PROGRESS,
              ProjectStatus.WAITING_CANCEL,
              ProjectStatus.REQUEST_EDIT,
            ],
          },
},
            {
              AND: [
                { procurement_status: { in: [ProjectPhaseStatus.COMPLETED] } },
                { contract_status: { in: [ProjectPhaseStatus.NOT_STARTED] } },
                {
                  status: {
                    in: [
                      ProjectStatus.UNASSIGNED,
                      ProjectStatus.WAITING_ACCEPT,
                    ],
                  },
                },
              ],
            },
          ],
        },
      }),
      prisma.project.count({
        where: { ...baseWhere, status: ProjectStatus.CLOSED },
      }),
      prisma.project.count({
        where: { ...baseWhere, status: ProjectStatus.CANCELLED },
      }),
      prisma.project.count({
        where: {
          ...baseWhere,
          is_urgent: {
            in: [
              UrgentType.URGENT,
              UrgentType.VERY_URGENT,
              UrgentType.SUPER_URGENT,
            ],
          },
        },
      }),
    ]);

  return {
    role: 'EXTERNAL',
    total,
    NOT_STARTED: not_started,
    [ProjectStatus.IN_PROGRESS]: in_progress,
    [ProjectStatus.CLOSED]: closed,
    [ProjectStatus.CANCELLED]: cancelled,
    [UrgentType.URGENT]: urgent,
  };
};
