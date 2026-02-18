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

  const deptFIN = await prisma.department.create({
    data: {
      id: 'DEPT-FIN',
      name: 'สำนักงานบริหารการเงิน การบัญชี และการพัสดุ',
      units: {
        create: [
          {
            id: 'UNIT-FIN',
            name: 'ฝ่ายการเงิน',
            type: [],
          },
          {
            id: 'UNIT-ACC',
            name: 'ฝ่ายการบัญชี',
            type: [],
          },
          {
            id: 'UNIT-SUP',
            name: 'ฝ่ายการพัสดุ',
            type: [],
          },
        ],
      },
    },
    select: {
      id: true,
      units: {
        select: {
          id: true,
        },
      },
    },
  });

  const deptSUPOPS = await prisma.department.create({
    data: {
      id: 'DEPT-SUP-OPS',
      name: 'Supply Operation',
      units: {
        create: [
          {
            id: 'UNIT-PROC-1',
            name: 'กลุ่มงานจัดซื้อจัดจ้าง 1',
            type: [UnitResponsibleType.LT100K, UnitResponsibleType.LT500K],
          },
          {
            id: 'UNIT-PROC-2',
            name: 'กลุ่มงานจัดซื้อจัดจ้าง 2',
            type: [
              UnitResponsibleType.MT500K,
              UnitResponsibleType.SELECTION,
              UnitResponsibleType.EBIDDING,
              UnitResponsibleType.INTERNAL,
            ],
          },
          {
            id: 'UNIT-CONT',
            name: 'กลุ่มงานบริหารสัญญา',
            type: [UnitResponsibleType.CONTRACT],
          },
        ],
      },
    },
    select: {
      id: true,
      units: {
        select: {
          id: true,
        },
      },
    },
  });

  const deptREG = await prisma.department.create({
    data: {
      id: 'DEPT-REG',
      name: 'สำนักงานทะเบียน',
    },
  });

  const deptLOC = await prisma.department.create({
    data: {
      id: 'DEPT-LOC',
      name: 'สำนักงานบริหารระบบกายภาพ',
      units: {
        create: [
          { id: 'UNIT-BUILD', name: 'ฝ่ายอาคารสถานที่', type: [] },
          { id: 'UNIT-MAINT', name: 'ฝ่ายซ่อมบำรุง', type: [] },
        ],
      },
    },
  });

  const deptSTUAFF = await prisma.department.create({
    data: {
      id: 'DEPT-STUAFF',
      name: 'สำนักบริหารกิจการนิสิต',
      units: {
        create: [
          { id: 'UNIT-EDU', name: 'ฝ่ายทุนการศึกษาและบริการนิสิต', type: [] },
          {
            id: 'UNIT-NET',
            name: 'ฝ่ายประสานงานและเครือข่ายกิจการนิสิต',
            type: [],
          },
        ],
      },
    },
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
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });
    const user = existingUser
      ? existingUser
      : await prisma.user.create({
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
  const superAdmin = await prisma.user.create({
    data: {
      username: 'super_admin',
      full_name: 'Super Admin',
      roles: {
        create: [
          {
            role_id: (
              await prisma.userRole.findUnique({ where: { name: RoleEnum.SUPER_ADMIN } })
            )!.id,
            dept_id: "SUPER_ADMIN",
            unit_id: null,
          },
        ],
      },
    },
  });

  const headDept = await assignRole(
    'boss_mike',
    'Mike Bossman',
    RoleEnum.GUEST,
    'DEPT-FIN',
    'UNIT-SUP'
  );

  await assignRole(
    'boss_mike',
    'Mike Bossman',
    RoleEnum.HEAD_OF_DEPARTMENT,
    deptSUPOPS.id
  );

  const headUnit1 = await assignRole(
    'head_proc1',
    'Bee Procurement',
    RoleEnum.HEAD_OF_UNIT,
    deptSUPOPS.id,
    'UNIT-PROC-1'
  );

  await assignRole(
    'head_proc1',
    'Bee Procurement',
    RoleEnum.GUEST,
    'DEPT-FIN',
    'UNIT-SUP'
  );

  const finStaff = await assignRole(
    'fin_lisa',
    'Lisa Finance',
    RoleEnum.FINANCE_STAFF,
    deptSUPOPS.id
  );

  await assignRole(
    'fin_lisa',
    'Lisa Finance',
    RoleEnum.GUEST,
    'DEPT-FIN',
    'UNIT-SUP'
  );

  const docStaff = await assignRole(
    'doc_mary',
    'Mary Document',
    RoleEnum.DOCUMENT_STAFF,
    deptSUPOPS.id
  );

  await assignRole(
    'doc_mary',
    'Mary Document',
    RoleEnum.GUEST,
    'DEPT-FIN',
    'UNIT-SUP'
  );

  const adminJane = await assignRole(
    'admin_jane',
    'Jane Doe',
    RoleEnum.ADMIN,
    deptSUPOPS.id
  );

  await assignRole(
    'admin_jane',
    'Jane Doe',
    RoleEnum.GUEST,
    'DEPT-FIN',
    'UNIT-SUP'
  );

  // Supply Roles (Unit-specific)
  const staffBob = await assignRole(
    'staff_bob',
    'Bob Smith',
    RoleEnum.GENERAL_STAFF,
    deptSUPOPS.id,
    'UNIT-PROC-1'
  );

  await assignRole(
    'staff_bob',
    'Bob Smith',
    RoleEnum.GUEST,
    'DEPT-FIN',
    'UNIT-SUP'
  );

  const staffAlice = await assignRole(
    'staff_alice',
    'Alice Jones',
    RoleEnum.GENERAL_STAFF,
    deptSUPOPS.id,
    'UNIT-PROC-2'
  );

  await assignRole(
    'staff_alice',
    'Alice Jones',
    RoleEnum.GUEST,
    'DEPT-FIN',
    'UNIT-SUP'
  );

  const staffCathy = await assignRole(
    'staff_cathy',
    'Cathy Williams',
    RoleEnum.GENERAL_STAFF,
    deptSUPOPS.id,
    'UNIT-CONT'
  );

  await assignRole(
    'staff_cathy',
    'Cathy Williams',
    RoleEnum.GUEST,
    'DEPT-FIN',
    'UNIT-SUP'
  );

  // External Roles
  const repCharlie = await assignRole(
    'rep_charlie',
    'Charlie Rep',
    RoleEnum.REPRESENTATIVE,
    deptLOC.id,
    'UNIT-BUILD'
  );

  const rep_kevin = await assignRole(
    'rep_kevin',
    'Kevin Rep',
    RoleEnum.REPRESENTATIVE,
    deptLOC.id,
    'UNIT-MAINT'
  );

  const regSam = await assignRole(
    'reg_sam',
    'Sam Registration',
    RoleEnum.GENERAL_STAFF,
    deptREG.id
  );

  const stuAffEmily = await assignRole(
    'stu_emily',
    'Emily StudentAffairs',
    RoleEnum.REPRESENTATIVE,
    deptSTUAFF.id,
    'UNIT-EDU'
  );

  await assignRole(
    'stu_emily',
    'Emily StudentAffairs',
    RoleEnum.REPRESENTATIVE,
    deptSTUAFF.id,
    'UNIT-NET'
  );

  // ---------------------------------------------------------
  // 5. DELEGATION (Mike delegates to Lisa for 7 days)
  // ---------------------------------------------------------
  await prisma.userDelegation.create({
    data: {
      delegator_id: headUnit1.id,
      delegatee_id: staffBob.id,
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
      responsible_unit_id: 'UNIT-PROC-1',
      requesting_dept_id: deptLOC.id,
      requesting_unit_id: 'UNIT-BUILD',
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
      responsible_unit_id: 'UNIT-PROC-2',
      requesting_dept_id: deptFIN.id,
      requesting_unit_id: 'UNIT-SUP',
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
      responsible_unit_id: 'UNIT-CONT',
      requesting_dept_id: deptSTUAFF.id,
      requesting_unit_id: 'UNIT-EDU',
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
