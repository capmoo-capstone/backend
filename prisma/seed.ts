import {
  ProcurementType,
  ProjectActionType,
  ProjectCancellationStatus,
  ProjectInstallmentStatus,
  ProjectPhaseStatus,
  ProjectStatus,
  SubmissionStatus,
  SubmissionType,
  UnitResponsibleType,
  UrgentType,
  UserRole,
} from '@prisma/client';
import bcrypt from 'bcrypt';
import { prisma } from '../src/config/prisma';
import { nowUtc, toBangkokParts } from '../src/lib/date';
import { departmentsAndUnitsData } from './seed-departments';
import { seedHolidays } from './seed-holidays';

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
    superAdmin: '00000000-0000-4000-8000-000000000001',
    admin: '00000000-0000-4000-8000-000000000002',
    supplyHead: '00000000-0000-4000-8000-000000000003',
    procHeadLt: '00000000-0000-4000-8000-000000000004',
    procHeadHigh: '00000000-0000-4000-8000-000000000005',
    contractHead: '00000000-0000-4000-8000-000000000006',
    procurementLt: '00000000-0000-4000-8000-000000000007',
    procurementHigh: '00000000-0000-4000-8000-000000000008',
    contractStaff: '00000000-0000-4000-8000-000000000009',
    financeStaff: '00000000-0000-4000-8000-000000000010',
    documentStaff: '00000000-0000-4000-8000-000000000011',
    facilitiesRep: '00000000-0000-4000-8000-000000000012',
    maintenanceRep: '00000000-0000-4000-8000-000000000013',
    itRep: '00000000-0000-4000-8000-000000000014',
    libraryStaff: '00000000-0000-4000-8000-000000000015',
    delegatedStaff: '00000000-0000-4000-8000-000000000016',
    guest: '00000000-0000-4000-8000-000000000017',
  },
  projects: {
    unassigned: '10000000-0000-4000-8000-000000000001',
    waitingAccept: '10000000-0000-4000-8000-000000000002',
    waitingApproval: '10000000-0000-4000-8000-000000000003',
    waitingProposal: '10000000-0000-4000-8000-000000000004',
    procurementComplete: '10000000-0000-4000-8000-000000000005',
    contractActive: '10000000-0000-4000-8000-000000000006',
    contractReadyExport: '10000000-0000-4000-8000-000000000007',
    closed: '10000000-0000-4000-8000-000000000008',
    waitingCancel: '10000000-0000-4000-8000-000000000009',
    cancelled: '10000000-0000-4000-8000-000000000010',
    requestEdit: '10000000-0000-4000-8000-000000000011',
    internal: '10000000-0000-4000-8000-000000000012',
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

type ContractNumberType = 'CU' | 'SP' | 'PSY' | 'NUR' | 'HS';

const cleanup = async () => {
  await prisma.notificationDelivery.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.projectDocument.deleteMany();
  await prisma.projectSubmission.deleteMany();
  await prisma.projectInstallment.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.projectCancellation.deleteMany();
  await prisma.projectHistory.deleteMany();
  await prisma.budgetPlan.deleteMany();
  await prisma.project.deleteMany();
  await prisma.projectContractNumber.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.registrationRequest.deleteMany();
  await prisma.userDelegation.deleteMany();
  await prisma.userOrganizationRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.department.deleteMany();
};

const seedOrganization = async () => {
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

  await prisma.unit.createMany({
    data: units,
  });
};

const seedUsers = async () => {
  await prisma.user.createMany({
    data: [
      {
        id: ids.users.superAdmin,
        username: 'super_admin',
        email: 'super_admin@example.test',
        full_name: 'Super Admin',
        password: bcrypt.hashSync('super_admin', 10),
      },
      {
        id: ids.users.admin,
        username: 'admin',
        email: 'admin@example.test',
        full_name: 'Admin',
        password: bcrypt.hashSync('admin', 10),
      },
      {
        id: ids.users.supplyHead,
        username: 'supply_head',
        email: 'supply_head@example.test',
        full_name: 'Supply Head',
        password: bcrypt.hashSync('supply_head', 10),
      },
      {
        id: ids.users.procHeadLt,
        username: 'proc_head1',
        email: 'proc_head1@example.test',
        full_name: 'Procurement Head1',
        password: bcrypt.hashSync('proc_head1', 10),
      },
      {
        id: ids.users.procHeadHigh,
        username: 'proc_head2',
        email: 'proc_head2@example.test',
        full_name: 'Procurement Head2',
        password: bcrypt.hashSync('proc_head2', 10),
      },
      {
        id: ids.users.contractHead,
        username: 'contract_head',
        email: 'contract_head@example.test',
        full_name: 'Contract Head',
        password: bcrypt.hashSync('contract_head', 10),
      },
      {
        id: ids.users.procurementLt,
        username: 'procurement1',
        email: 'procurement1@example.test',
        full_name: 'Procurement1',
        password: bcrypt.hashSync('procurement1', 10),
      },
      {
        id: ids.users.procurementHigh,
        username: 'procurement2',
        email: 'procurement2@example.test',
        full_name: 'Procurement2',
        password: bcrypt.hashSync('procurement2', 10),
      },
      {
        id: ids.users.contractStaff,
        username: 'contract',
        email: 'contract@example.test',
        full_name: 'Contract',
        password: bcrypt.hashSync('contract', 10),
      },
      {
        id: ids.users.financeStaff,
        username: 'finance_staff',
        email: 'finance_staff@example.test',
        full_name: 'Finance Staff',
        password: bcrypt.hashSync('finance_staff', 10),
      },
      {
        id: ids.users.documentStaff,
        username: 'document_staff',
        email: 'document_staff@example.test',
        full_name: 'Document Staff',
        password: bcrypt.hashSync('document_staff', 10),
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
        id: ids.users.itRep,
        username: 'registration_staff',
        email: 'registration_staff@example.test',
        full_name: 'Registration Staff',
        password: bcrypt.hashSync('registration_staff', 10),
      },
      {
        id: ids.users.libraryStaff,
        username: 'student_affairs_rep',
        email: 'student_affairs_rep@example.test',
        full_name: 'Student Affairs Rep',
        password: bcrypt.hashSync('student_affairs_rep', 10),
      },
      {
        id: ids.users.delegatedStaff,
        username: 'delegated_staff',
        email: 'delegated_staff@example.test',
        full_name: 'Delegated Staff',
        password: bcrypt.hashSync('delegated_staff', 10),
      },
      {
        id: ids.users.guest,
        username: 'guest',
        email: 'guest@example.test',
        full_name: 'Guest',
        password: bcrypt.hashSync('guest', 10),
      },
    ],
  });

  await prisma.userOrganizationRole.createMany({
    data: [
      {
        user_id: ids.users.superAdmin,
        role: UserRole.SUPER_ADMIN,
        dept_id: 'DEPT-SUP-OPS',
      },
      {
        user_id: ids.users.admin,
        role: UserRole.ADMIN,
        dept_id: 'DEPT-SUP-OPS',
      },
      {
        user_id: ids.users.supplyHead,
        role: UserRole.HEAD_OF_DEPARTMENT,
        dept_id: 'DEPT-SUP-OPS',
      },
      {
        user_id: ids.users.procHeadLt,
        role: UserRole.HEAD_OF_UNIT,
        dept_id: 'DEPT-SUP-OPS',
        unit_id: 'UNIT-PROC-1',
      },
      {
        user_id: ids.users.procHeadHigh,
        role: UserRole.HEAD_OF_UNIT,
        dept_id: 'DEPT-SUP-OPS',
        unit_id: 'UNIT-PROC-2',
      },
      {
        user_id: ids.users.contractHead,
        role: UserRole.HEAD_OF_UNIT,
        dept_id: 'DEPT-SUP-OPS',
        unit_id: 'UNIT-CONT',
      },
      {
        user_id: ids.users.procurementLt,
        role: UserRole.GENERAL_STAFF,
        dept_id: 'DEPT-SUP-OPS',
        unit_id: 'UNIT-PROC-1',
      },
      {
        user_id: ids.users.procurementHigh,
        role: UserRole.GENERAL_STAFF,
        dept_id: 'DEPT-SUP-OPS',
        unit_id: 'UNIT-PROC-2',
      },
      {
        user_id: ids.users.contractStaff,
        role: UserRole.GENERAL_STAFF,
        dept_id: 'DEPT-SUP-OPS',
        unit_id: 'UNIT-CONT',
      },
      {
        user_id: ids.users.financeStaff,
        role: UserRole.FINANCE_STAFF,
        dept_id: 'DEPT-SUP-OPS',
      },
      {
        user_id: ids.users.documentStaff,
        role: UserRole.DOCUMENT_STAFF,
        dept_id: 'DEPT-SUP-OPS',
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
        user_id: ids.users.itRep,
        role: UserRole.GUEST,
        dept_id: 'DEPT-REG',
      },
      {
        user_id: ids.users.libraryStaff,
        role: UserRole.REPRESENTATIVE,
        dept_id: 'DEPT-STUAFF',
        unit_id: 'UNIT-STU-SCHOLAR',
      },
      {
        user_id: ids.users.libraryStaff,
        role: UserRole.REPRESENTATIVE,
        dept_id: 'DEPT-STUAFF',
        unit_id: 'UNIT-STU-COORD',
      },
      {
        user_id: ids.users.delegatedStaff,
        role: UserRole.GENERAL_STAFF,
        dept_id: 'DEPT-SUP-OPS',
        unit_id: 'UNIT-PROC-1',
      },
      {
        user_id: ids.users.admin,
        role: UserRole.GUEST,
        dept_id: 'DEPT-FIN',
        unit_id: 'UNIT-FIN-SUP',
      },
      {
        user_id: ids.users.supplyHead,
        role: UserRole.GUEST,
        dept_id: 'DEPT-FIN',
        unit_id: 'UNIT-FIN-SUP',
      },
      {
        user_id: ids.users.procHeadLt,
        role: UserRole.GUEST,
        dept_id: 'DEPT-FIN',
        unit_id: 'UNIT-FIN-SUP',
      },
      {
        user_id: ids.users.procHeadHigh,
        role: UserRole.GUEST,
        dept_id: 'DEPT-FIN',
        unit_id: 'UNIT-FIN-SUP',
      },
      {
        user_id: ids.users.contractHead,
        role: UserRole.GUEST,
        dept_id: 'DEPT-FIN',
        unit_id: 'UNIT-FIN-SUP',
      },
      {
        user_id: ids.users.procurementLt,
        role: UserRole.GUEST,
        dept_id: 'DEPT-FIN',
        unit_id: 'UNIT-FIN-SUP',
      },
      {
        user_id: ids.users.procurementHigh,
        role: UserRole.GUEST,
        dept_id: 'DEPT-FIN',
        unit_id: 'UNIT-FIN-SUP',
      },
      {
        user_id: ids.users.contractStaff,
        role: UserRole.GUEST,
        dept_id: 'DEPT-FIN',
        unit_id: 'UNIT-FIN-SUP',
      },
      {
        user_id: ids.users.financeStaff,
        role: UserRole.GUEST,
        dept_id: 'DEPT-FIN',
        unit_id: 'UNIT-FIN-SUP',
      },
      {
        user_id: ids.users.documentStaff,
        role: UserRole.GUEST,
        dept_id: 'DEPT-FIN',
        unit_id: 'UNIT-FIN-SUP',
      },
      {
        user_id: ids.users.delegatedStaff,
        role: UserRole.GUEST,
        dept_id: 'DEPT-FIN',
        unit_id: 'UNIT-FIN-SUP',
      },
      {
        user_id: ids.users.guest,
        role: UserRole.GUEST,
        dept_id: 'DEPT-REG',
      },
    ],
  });

  await prisma.userDelegation.create({
    data: {
      delegator_id: ids.users.procHeadLt,
      delegatee_id: ids.users.delegatedStaff,
      role: UserRole.HEAD_OF_UNIT,
      unit_id: 'UNIT-PROC-1',
      start_date: daysFromNow(-1),
      end_date: daysFromNow(14),
      is_active: true,
      created_by: ids.users.admin,
    },
  });
};

async function main() {
  console.log('--- Start User Testing Seed ---');
  await cleanup();
  console.log('--- Database cleaned ---');

  await seedOrganization();
  await seedUsers();
  await seedHolidays();

  console.log('--- User Testing Seed Completed ---');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
