import {
  ProcurementType,
  ProjectStatus,
  UrgentType,
  UserRole,
} from '@prisma/client';
import bcrypt from 'bcrypt';
import { prisma } from '../src/config/prisma';
import { DEFAULT_PHASE } from '../src/lib/constant';
import { nowUtc, toBangkokParts } from '../src/lib/date';
import { departmentsAndUnitsData } from './seed-departments';

const DAY_MS = 24 * 60 * 60 * 1000;
const now = nowUtc();
const daysFromNow = (days: number) => new Date(now.getTime() + days * DAY_MS);

const fiscalYear = (date = now) => {
  const parts = toBangkokParts(date);
  const thaiYear = parts.year + 543;
  return parts.month >= 10 ? thaiYear + 1 : thaiYear;
};

const ids = {
  users: {
    libraryStaff: '00000000-0000-4000-8000-000000000015',
    itRep: '00000000-0000-4000-8000-000000000014',
    facilitiesRep: '00000000-0000-4000-8000-000000000012',
    maintenanceRep: '00000000-0000-4000-8000-000000000013',
    financeStaff: '00000000-0000-4000-8000-000000000010',
  },
  projects: {
    unassignedLt100k1: '10000000-0000-4000-8000-000000000101',
    unassignedLt100k2: '10000000-0000-4000-8000-000000000102',
    unassignedLt100k3: '10000000-0000-4000-8000-000000000103',
    unassignedLt500k1: '10000000-0000-4000-8000-000000000104',
    unassignedLt500k2: '10000000-0000-4000-8000-000000000105',
    unassignedLt500k3: '10000000-0000-4000-8000-000000000106',
    unassignedMt500k1: '10000000-0000-4000-8000-000000000107',
    unassignedMt500k2: '10000000-0000-4000-8000-000000000108',
    unassignedMt500k3: '10000000-0000-4000-8000-000000000109',
    unassignedSelection1: '10000000-0000-4000-8000-000000000110',
    unassignedSelection2: '10000000-0000-4000-8000-000000000111',
    unassignedSelection3: '10000000-0000-4000-8000-000000000112',
    unassignedEbidding1: '10000000-0000-4000-8000-000000000113',
    unassignedEbidding2: '10000000-0000-4000-8000-000000000114',
    unassignedEbidding3: '10000000-0000-4000-8000-000000000115',
    unassignedInternal1: '10000000-0000-4000-8000-000000000116',
    unassignedInternal2: '10000000-0000-4000-8000-000000000117',
    unassignedInternal3: '10000000-0000-4000-8000-000000000118',
  },
};

const workflowUnitByProcurement: Record<ProcurementType, string> = {
  [ProcurementType.LT100K]: 'UNIT-PROC-1',
  [ProcurementType.LT500K]: 'UNIT-PROC-1',
  [ProcurementType.MT500K]: 'UNIT-PROC-2',
  [ProcurementType.SELECTION]: 'UNIT-PROC-2',
  [ProcurementType.EBIDDING]: 'UNIT-PROC-2',
  [ProcurementType.INTERNAL]: 'UNIT-PROC-2',
};

const clearProjectDatabase = async () => {
  await prisma.notificationDelivery.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.projectDocument.deleteMany();
  await prisma.projectSubmission.deleteMany();
  await prisma.projectInstallment.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.projectCancellation.deleteMany();
  await prisma.projectHistory.deleteMany();
  await prisma.project.deleteMany();
  await prisma.projectContractNumber.deleteMany();
};

const ensurePrerequisitesExist = async () => {
  const deptCount = await prisma.department.count();
  if (deptCount === 0) {
    console.log('Seeding departments and units...');
    await prisma.department.createMany({
      data: departmentsAndUnitsData.map((dept) => ({
        id: dept.id,
        name: dept.name,
      })),
    });

    const units = departmentsAndUnitsData.flatMap((dept) =>
      (dept.units ?? []).map((unit) => ({
        id: unit.id,
        dept_id: dept.id,
        name: unit.name,
        budget_code: unit.budget_code ?? null,
        type: unit.type ?? [],
      }))
    );

    await prisma.unit.createMany({ data: units });
  }

  const userCount = await prisma.user.count();
  if (userCount === 0) {
    console.log('Seeding prerequisite users...');
    const usersData = [
      {
        id: ids.users.libraryStaff,
        username: 'student_affairs_rep',
        email: 'student_affairs_rep@example.test',
        full_name: 'Student Affairs Rep',
        password: bcrypt.hashSync('student_affairs_rep', 10),
      },
      {
        id: ids.users.itRep,
        username: 'registration_staff',
        email: 'registration_staff@example.test',
        full_name: 'Registration Staff',
        password: bcrypt.hashSync('registration_staff', 10),
      },
      {
        id: ids.users.facilitiesRep,
        username: 'facilities_rep',
        email: 'facilities_rep@example.test',
        full_name: 'Facilities Rep',
        password: bcrypt.hashSync('facilities_rep', 10),
      },
      {
        id: ids.users.maintenanceRep,
        username: 'maintenance_rep',
        email: 'maintenance_rep@example.test',
        full_name: 'Maintenance Rep',
        password: bcrypt.hashSync('maintenance_rep', 10),
      },
      {
        id: ids.users.financeStaff,
        username: 'finance_staff',
        email: 'finance_staff@example.test',
        full_name: 'Finance Staff',
        password: bcrypt.hashSync('finance_staff', 10),
      },
    ];

    await prisma.user.createMany({ data: usersData });

    await prisma.userOrganizationRole.createMany({
      data: [
        {
          user_id: ids.users.libraryStaff,
          role: UserRole.REPRESENTATIVE,
          dept_id: 'DEPT-STUAFF',
          unit_id: 'UNIT-STU-SCHOLAR',
        },
        {
          user_id: ids.users.itRep,
          role: UserRole.REPRESENTATIVE,
          dept_id: 'DEPT-REG',
        },
        {
          user_id: ids.users.facilitiesRep,
          role: UserRole.REPRESENTATIVE,
          dept_id: 'DEPT-LOC',
          unit_id: 'UNIT-LOC-BUILD',
        },
        {
          user_id: ids.users.maintenanceRep,
          role: UserRole.REPRESENTATIVE,
          dept_id: 'DEPT-LOC',
          unit_id: 'UNIT-LOC-MAINT',
        },
        {
          user_id: ids.users.financeStaff,
          role: UserRole.FINANCE_STAFF,
          dept_id: 'DEPT-FIN',
          unit_id: 'UNIT-FIN-ACC',
        },
      ],
    });
  }
};

const createUnassignedProject = async (data: {
  id: string;
  receiveSuffix: number;
  title: string;
  description: string;
  budget: number;
  procurementType: ProcurementType;
  requestingDeptId: string;
  requestingUnitId?: string | null;
  createdBy: string;
  expectedApprovalDays?: number;
}) => {
  const responsibleUnitId = workflowUnitByProcurement[data.procurementType];

  return await prisma.project.create({
    data: {
      id: data.id,
      receive_no: `${fiscalYear()}/${data.receiveSuffix.toString().padStart(5, '0')}`,
      title: data.title,
      description: data.description,
      budget: data.budget,
      status: ProjectStatus.UNASSIGNED,
      procurement_type: data.procurementType,
      current_workflow_type: data.procurementType,
      responsible_unit_id: responsibleUnitId,
      requesting_dept_id: data.requestingDeptId,
      requesting_unit_id: data.requestingUnitId ?? null,
      created_by: data.createdBy,
      is_urgent: UrgentType.NORMAL,
      expected_approval_date:
        data.expectedApprovalDays === undefined
          ? null
          : daysFromNow(data.expectedApprovalDays),
      installment_rounds: 1,
      procurement_progress: DEFAULT_PHASE as any,
      contract_progress: DEFAULT_PHASE as any,
    },
  });
};

const seedUnassignedProjects = async () => {
  const unassignedProjectsData = [
    // 1. ProcurementType.LT100K
    {
      id: ids.projects.unassignedLt100k1,
      receiveSuffix: 101,
      title: 'User Testing - New chairs for reading room',
      description: 'UNASSIGNED LT100K project - ergonomic chairs procurement.',
      budget: 75000,
      procurementType: ProcurementType.LT100K,
      requestingDeptId: 'DEPT-STUAFF',
      requestingUnitId: 'UNIT-STU-SCHOLAR',
      createdBy: ids.users.libraryStaff,
      expectedApprovalDays: 7,
    },
    {
      id: ids.projects.unassignedLt100k2,
      receiveSuffix: 102,
      title: 'User Testing - Stationery and office consumables',
      description:
        'UNASSIGNED LT100K project - office consumables procurement.',
      budget: 35000,
      procurementType: ProcurementType.LT100K,
      requestingDeptId: 'DEPT-REG',
      requestingUnitId: null,
      createdBy: ids.users.itRep,
      expectedApprovalDays: 5,
    },
    {
      id: ids.projects.unassignedLt100k3,
      receiveSuffix: 103,
      title: 'User Testing - Air purifier replacement filters',
      description: 'UNASSIGNED LT100K project - air filter replacements.',
      budget: 85000,
      procurementType: ProcurementType.LT100K,
      requestingDeptId: 'DEPT-LOC',
      requestingUnitId: 'UNIT-LOC-BUILD',
      createdBy: ids.users.facilitiesRep,
      expectedApprovalDays: 6,
    },

    // 2. ProcurementType.LT500K
    {
      id: ids.projects.unassignedLt500k1,
      receiveSuffix: 104,
      title: 'User Testing - Staff workstation laptops',
      description: 'UNASSIGNED LT500K project - replacement laptops.',
      budget: 320000,
      procurementType: ProcurementType.LT500K,
      requestingDeptId: 'DEPT-REG',
      requestingUnitId: null,
      createdBy: ids.users.itRep,
      expectedApprovalDays: 10,
    },
    {
      id: ids.projects.unassignedLt500k2,
      receiveSuffix: 105,
      title: 'User Testing - Meeting room 4K projector replacement',
      description: 'UNASSIGNED LT500K project - 4K conference room projector.',
      budget: 180000,
      procurementType: ProcurementType.LT500K,
      requestingDeptId: 'DEPT-FIN',
      requestingUnitId: 'UNIT-FIN-ACC',
      createdBy: ids.users.financeStaff,
      expectedApprovalDays: 8,
    },
    {
      id: ids.projects.unassignedLt500k3,
      receiveSuffix: 106,
      title: 'User Testing - Computer lab desktop workstation upgrade',
      description: 'UNASSIGNED LT500K project - student lab PC upgrade.',
      budget: 450000,
      procurementType: ProcurementType.LT500K,
      requestingDeptId: 'DEPT-STUAFF',
      requestingUnitId: 'UNIT-STU-COORD',
      createdBy: ids.users.libraryStaff,
      expectedApprovalDays: 12,
    },

    // 3. ProcurementType.MT500K
    {
      id: ids.projects.unassignedMt500k1,
      receiveSuffix: 107,
      title: 'User Testing - Accounting software enterprise license renewal',
      description: 'UNASSIGNED MT500K project - annual software license.',
      budget: 690000,
      procurementType: ProcurementType.MT500K,
      requestingDeptId: 'DEPT-FIN',
      requestingUnitId: 'UNIT-FIN-ACC',
      createdBy: ids.users.financeStaff,
      expectedApprovalDays: 14,
    },
    {
      id: ids.projects.unassignedMt500k2,
      receiveSuffix: 108,
      title: 'User Testing - Server room precision cooling unit upgrade',
      description: 'UNASSIGNED MT500K project - precision air conditioning.',
      budget: 850000,
      procurementType: ProcurementType.MT500K,
      requestingDeptId: 'DEPT-REG',
      requestingUnitId: null,
      createdBy: ids.users.itRep,
      expectedApprovalDays: 15,
    },
    {
      id: ids.projects.unassignedMt500k3,
      receiveSuffix: 109,
      title: 'User Testing - Core network switch infrastructure expansion',
      description:
        'UNASSIGNED MT500K project - high-capacity core network switches.',
      budget: 920000,
      procurementType: ProcurementType.MT500K,
      requestingDeptId: 'DEPT-LOC',
      requestingUnitId: 'UNIT-LOC-MAINT',
      createdBy: ids.users.maintenanceRep,
      expectedApprovalDays: 14,
    },

    // 4. ProcurementType.SELECTION
    {
      id: ids.projects.unassignedSelection1,
      receiveSuffix: 110,
      title: 'User Testing - Campus building security guard service contract',
      description:
        'UNASSIGNED SELECTION project - 24/7 security service contract.',
      budget: 1200000,
      procurementType: ProcurementType.SELECTION,
      requestingDeptId: 'DEPT-LOC',
      requestingUnitId: 'UNIT-LOC-BUILD',
      createdBy: ids.users.facilitiesRep,
      expectedApprovalDays: 20,
    },
    {
      id: ids.projects.unassignedSelection2,
      receiveSuffix: 111,
      title: 'User Testing - Janitorial and facility cleaning service contract',
      description: 'UNASSIGNED SELECTION project - facility cleaning service.',
      budget: 1500000,
      procurementType: ProcurementType.SELECTION,
      requestingDeptId: 'DEPT-LOC',
      requestingUnitId: 'UNIT-LOC-MAINT',
      createdBy: ids.users.maintenanceRep,
      expectedApprovalDays: 18,
    },
    {
      id: ids.projects.unassignedSelection3,
      receiveSuffix: 112,
      title:
        'User Testing - Elevator and escalator maintenance service contract',
      description:
        'UNASSIGNED SELECTION project - elevator preventive maintenance.',
      budget: 2100000,
      procurementType: ProcurementType.SELECTION,
      requestingDeptId: 'DEPT-LOC',
      requestingUnitId: 'UNIT-LOC-BUILD',
      createdBy: ids.users.facilitiesRep,
      expectedApprovalDays: 21,
    },

    // 5. ProcurementType.EBIDDING
    {
      id: ids.projects.unassignedEbidding1,
      receiveSuffix: 113,
      title: 'User Testing - Data center UPS & power redundancy upgrade',
      description: 'UNASSIGNED EBIDDING project - industrial UPS system.',
      budget: 3500000,
      procurementType: ProcurementType.EBIDDING,
      requestingDeptId: 'DEPT-REG',
      requestingUnitId: null,
      createdBy: ids.users.itRep,
      expectedApprovalDays: 30,
    },
    {
      id: ids.projects.unassignedEbidding2,
      receiveSuffix: 114,
      title: 'User Testing - Building rooftop solar PV panel installation',
      description: 'UNASSIGNED EBIDDING project - rooftop solar PV system.',
      budget: 5000000,
      procurementType: ProcurementType.EBIDDING,
      requestingDeptId: 'DEPT-LOC',
      requestingUnitId: 'UNIT-LOC-BUILD',
      createdBy: ids.users.facilitiesRep,
      expectedApprovalDays: 30,
    },
    {
      id: ids.projects.unassignedEbidding3,
      receiveSuffix: 115,
      title:
        'User Testing - Campus-wide high-speed fiber optic network expansion',
      description:
        'UNASSIGNED EBIDDING project - optical fiber network upgrade.',
      budget: 7200000,
      procurementType: ProcurementType.EBIDDING,
      requestingDeptId: 'DEPT-REG',
      requestingUnitId: null,
      createdBy: ids.users.itRep,
      expectedApprovalDays: 35,
    },

    // 6. ProcurementType.INTERNAL
    {
      id: ids.projects.unassignedInternal1,
      receiveSuffix: 116,
      title: 'User Testing - Internal spare parts transfer',
      description: 'UNASSIGNED INTERNAL project - internal inventory transfer.',
      budget: 120000,
      procurementType: ProcurementType.INTERNAL,
      requestingDeptId: 'DEPT-FIN',
      requestingUnitId: 'UNIT-FIN',
      createdBy: ids.users.financeStaff,
      expectedApprovalDays: 5,
    },
    {
      id: ids.projects.unassignedInternal2,
      receiveSuffix: 117,
      title: 'User Testing - Inter-departmental IT equipment reallocation',
      description: 'UNASSIGNED INTERNAL project - IT hardware reallocation.',
      budget: 280000,
      procurementType: ProcurementType.INTERNAL,
      requestingDeptId: 'DEPT-REG',
      requestingUnitId: null,
      createdBy: ids.users.itRep,
      expectedApprovalDays: 7,
    },
    {
      id: ids.projects.unassignedInternal3,
      receiveSuffix: 118,
      title: 'User Testing - Internal publication paper stock procurement',
      description:
        'UNASSIGNED INTERNAL project - printing paper stock procurement.',
      budget: 350000,
      procurementType: ProcurementType.INTERNAL,
      requestingDeptId: 'DEPT-STUAFF',
      requestingUnitId: 'UNIT-STU-COORD',
      createdBy: ids.users.libraryStaff,
      expectedApprovalDays: 6,
    },
  ];

  for (const proj of unassignedProjectsData) {
    await createUnassignedProject(proj);
  }
};

async function main() {
  console.log(
    '--- Start Clearing Project Database & Seeding Unassigned Projects ---'
  );
  await clearProjectDatabase();
  console.log('--- Project Database Cleared ---');

  await ensurePrerequisitesExist();
  await seedUnassignedProjects();

  console.log(
    '--- Successfully Seeded 18 Unassigned Projects (3 per Procurement Type) ---'
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
