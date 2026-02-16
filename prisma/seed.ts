import {
  ProjectStatus,
  ProcurementType,
  SubmissionStatus,
  UnitResponsibleType,
  Role as RoleEnum,
  UrgentType,
} from '@prisma/client';
import { prisma } from '../src/config/prisma';

async function main() {
  console.log('--- Start Seeding ---');

  // ---------------------------------------------------------
  // 1. CLEANUP (Order matters to avoid Foreign Key errors)
  // ---------------------------------------------------------
  await prisma.userDelegation.deleteMany();
  await prisma.userOrganizationRole.deleteMany();
  await prisma.projectDocument.deleteMany();
  await prisma.projectSubmission.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.department.deleteMany();
  console.log('--- Database Cleaned ---');

  // ---------------------------------------------------------
  // 2. ROLE TEMPLATES
  // ---------------------------------------------------------
  // Populate the Role table from the Enum
  const roleEnums = Object.values(RoleEnum);
  for (const name of roleEnums) {
    await prisma.userRole.create({ data: { name } });
  }

  // ---------------------------------------------------------
  // 3. ORGANIZATIONAL STRUCTURE
  // ---------------------------------------------------------
  const deptSUP = await prisma.department.create({
    data: { name: 'Office of Supply', code: 'SUPPLY' },
  });

  const deptREG = await prisma.department.create({
    data: { name: 'Office of Registration', code: 'REGISTRATION' },
  });

  const deptENG = await prisma.department.create({
    data: { name: 'Faculty of Engineering', code: 'ENGINEERING' },
  });

  // Supply Units
  const unit1 = await prisma.unit.create({
    data: {
      name: 'Procurement 1',
      dept_id: deptSUP.id,
      type: [UnitResponsibleType.LT100K, UnitResponsibleType.LT500K],
    },
  });
  const unit2 = await prisma.unit.create({
    data: {
      name: 'Procurement 2',
      dept_id: deptSUP.id,
      type: [
        UnitResponsibleType.MT500K,
        UnitResponsibleType.SELECTION,
        UnitResponsibleType.EBIDDING,
      ],
    },
  });
  const unit3 = await prisma.unit.create({
    data: {
      name: 'Contract',
      dept_id: deptSUP.id,
      type: [UnitResponsibleType.CONTRACT],
    },
  });

  // External Unit
  const engineeringUnit = await prisma.unit.create({
    data: { name: 'Engineering Unit', dept_id: deptENG.id, type: [] },
  });

  // ---------------------------------------------------------
  // 4. USERS & ROLE ASSIGNMENTS
  // ---------------------------------------------------------

  // Helper to quickly assign roles
  const assignRole = async (
    username: string,
    fullName: string,
    roleName: RoleEnum,
    deptId: string,
    unitId: string | null = null
  ) => {
    const user = await prisma.user.create({
      data: { username, full_name: fullName },
    });
    const roleRecord = await prisma.userRole.findUnique({
      where: { name: roleName },
    });
    await prisma.userOrganizationRole.create({
      data: {
        user_id: user.id,
        role_id: roleRecord!.id,
        dept_id: deptId,
        unit_id: unitId,
      },
    });
    return user;
  };

  // Supply Roles (Unit-less Department roles)
  const headDept = await assignRole(
    'boss_mike',
    'Mike Bossman',
    RoleEnum.HEAD_OF_DEPARTMENT,
    deptSUP.id
  );
  const finStaff = await assignRole(
    'fin_lisa',
    'Lisa Finance',
    RoleEnum.FINANCE_STAFF,
    deptSUP.id
  );
  const docStaff = await assignRole(
    'doc_mary',
    'Mary Document',
    RoleEnum.DOCUMENT_STAFF,
    deptSUP.id
  );

  // Supply Roles (Unit-specific)
  const adminJane = await assignRole(
    'admin_jane',
    'Jane Doe',
    RoleEnum.ADMIN,
    deptSUP.id,
    unit1.id
  );
  const staffBob = await assignRole(
    'staff_bob',
    'Bob Smith',
    RoleEnum.GENERAL_STAFF,
    deptSUP.id,
    unit1.id
  );
  const staffAlice = await assignRole(
    'staff_alice',
    'Alice Jones',
    RoleEnum.GENERAL_STAFF,
    deptSUP.id,
    unit2.id
  );
  const staffCathy = await assignRole(
    'staff_cathy',
    'Cathy Williams',
    RoleEnum.GENERAL_STAFF,
    deptSUP.id,
    unit3.id
  );

  // External Roles
  const repCharlie = await assignRole(
    'rep_charlie',
    'Charlie Rep',
    RoleEnum.REPRESENTATIVE,
    deptENG.id,
    engineeringUnit.id
  );
  const regSam = await assignRole(
    'reg_sam',
    'Sam Registration',
    RoleEnum.GENERAL_STAFF,
    deptREG.id
  );

  // ---------------------------------------------------------
  // 5. DELEGATION (Mike delegates to Lisa for 7 days)
  // ---------------------------------------------------------
  await prisma.userDelegation.create({
    data: {
      delegator_id: headDept.id,
      delegatee_id: finStaff.id,
      start_date: new Date(),
      end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  // ---------------------------------------------------------
  // 6. PROJECTS & WORKFLOW
  // ---------------------------------------------------------
  const projects = [
    {
      title: 'New Server Purchase 2026',
      receive_no: '1',
      budget: 150000.0,
      status: ProjectStatus.IN_PROGRESS,
      procurement_type: ProcurementType.LT500K,
      current_workflow_type: UnitResponsibleType.LT500K,
      created_by: adminJane.id,
      assignee_procurement: { connect: [{ id: staffBob.id }] },
      is_urgent: UrgentType.URGENT,
      expected_approval_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
    },
    {
      title: 'Cloud Infrastructure Upgrade',
      receive_no: '2',
      budget: 750000.0,
      status: ProjectStatus.IN_PROGRESS,
      procurement_type: ProcurementType.MT500K,
      current_workflow_type: UnitResponsibleType.MT500K,
      created_by: adminJane.id,
      assignee_procurement: { connect: [{ id: staffAlice.id }] },
      is_urgent: UrgentType.NORMAL,
    },
    {
      title: 'Office Renovation',
      receive_no: '3',
      budget: 750000.0,
      status: ProjectStatus.IN_PROGRESS,
      procurement_type: ProcurementType.SELECTION,
      current_workflow_type: UnitResponsibleType.CONTRACT,
      created_by: adminJane.id,
      assignee_procurement: { connect: [{ id: staffAlice.id }] },
      assignee_contract: { connect: [{ id: staffCathy.id }] },
      is_urgent: UrgentType.NORMAL,
    },
  ];

  let createdProject = [];

  for (const p of projects) {
    const created = await prisma.project.create({ data: p });
    createdProject.push(created);
  }

  await prisma.projectSubmission.create({
    data: {
      project_id: createdProject[0].id,
      workflow_type: projects[0].current_workflow_type as UnitResponsibleType,
      step_order: 1,
      submission_round: 1,
      status: SubmissionStatus.WAITING_APPROVAL,
      submitted_by: staffBob.id,
      documents: {
        create: [
          {
            file_name: 'initial_proposal.pdf',
            file_path: `/uploads/${createdProject[0].receive_no}/proposal.pdf`,
          },
        ],
      },
    },
  });

  await prisma.projectSubmission.create({
    data: {
      project_id: createdProject[1].id,
      workflow_type: projects[1].current_workflow_type as UnitResponsibleType,
      step_order: 1,
      submission_round: 1,
      status: SubmissionStatus.WAITING_APPROVAL,
      submitted_by: staffAlice.id,
      documents: {
        create: [
          {
            file_name: 'initial_proposal.pdf',
            file_path: `/uploads/${createdProject[1].receive_no}/proposal.pdf`,
          },
        ],
      },
    },
  });

  for (let i = 1; i < 4; i++) {
    await prisma.projectSubmission.create({
      data: {
        project_id: createdProject[2].id,
        workflow_type: UnitResponsibleType.SELECTION,
        step_order: i,
        submission_round: 1,
        status: SubmissionStatus.COMPLETED,
        submitted_by: staffAlice.id,
        documents: {
          create: [
            {
              file_name: 'initial_proposal.pdf',
              file_path: `/uploads/${createdProject[2].receive_no}/proposal.pdf`,
            },
          ],
        },
      },
    });
  }

  await prisma.projectSubmission.create({
    data: {
      project_id: createdProject[2].id,
      workflow_type: UnitResponsibleType.CONTRACT,
      step_order: 1,
      submission_round: 1,
      status: SubmissionStatus.WAITING_APPROVAL,
      submitted_by: staffCathy.id,
      documents: {
        create: [
          {
            file_name: 'initial_proposal.pdf',
            file_path: `/uploads/${createdProject[2].receive_no}/proposal.pdf`,
          },
        ],
      },
    },
  });

  // 7. SUBMISSIONS & DOCUMENTS

  console.log('--- Seeding Completed Successfully ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
