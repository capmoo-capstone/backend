import {
  ProjectStatus,
  ProcurementType,
  SubmissionStatus,
  UnitResponsibleType,
  UserRole,
  UrgentType,
} from '@prisma/client';
import { prisma } from '../src/config/prisma';
import { WORKFLOW_STEP_ORDERS } from '../src/lib/constant';

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
  await prisma.unit.deleteMany();
  await prisma.department.deleteMany();
  await prisma.budgetPlan.deleteMany();
  console.log('--- Database Cleaned ---');

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

  const deptSuperAdmin = await prisma.department.create({
    data: {
      id: 'SUPER_ADMIN',
      name: 'Super Admin Department',
    },
  });

  // ---------------------------------------------------------
  // 4. USERS & ROLE ASSIGNMENTS
  // ---------------------------------------------------------

  // Helper to quickly assign roles
  const assignRole = async (
    username: string,
    fullName: string,
    roleName: UserRole,
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
    await prisma.userOrganizationRole.create({
      data: {
        user_id: user.id,
        role: roleName,
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
            role: UserRole.SUPER_ADMIN,
            dept_id: 'SUPER_ADMIN',
            unit_id: null,
          },
        ],
      },
    },
  });

  const headDept = await assignRole(
    'boss_mike',
    'Mike Bossman',
    UserRole.GUEST,
    'DEPT-FIN',
    'UNIT-SUP'
  );

  await assignRole(
    'boss_mike',
    'Mike Bossman',
    UserRole.HEAD_OF_DEPARTMENT,
    deptSUPOPS.id
  );

  const headUnit1 = await assignRole(
    'head_proc1',
    'Bee Procurement',
    UserRole.HEAD_OF_UNIT,
    deptSUPOPS.id,
    'UNIT-PROC-1'
  );

  await assignRole(
    'head_proc1',
    'Bee Procurement',
    UserRole.GUEST,
    'DEPT-FIN',
    'UNIT-SUP'
  );

  const finStaff = await assignRole(
    'fin_lisa',
    'Lisa Finance',
    UserRole.FINANCE_STAFF,
    deptSUPOPS.id
  );

  await assignRole(
    'fin_lisa',
    'Lisa Finance',
    UserRole.GUEST,
    'DEPT-FIN',
    'UNIT-SUP'
  );

  const docStaff = await assignRole(
    'doc_mary',
    'Mary Document',
    UserRole.DOCUMENT_STAFF,
    deptSUPOPS.id
  );

  await assignRole(
    'doc_mary',
    'Mary Document',
    UserRole.GUEST,
    'DEPT-FIN',
    'UNIT-SUP'
  );

  const adminJane = await assignRole(
    'admin_jane',
    'Jane Doe',
    UserRole.ADMIN,
    deptSUPOPS.id
  );

  await assignRole(
    'admin_jane',
    'Jane Doe',
    UserRole.GUEST,
    'DEPT-FIN',
    'UNIT-SUP'
  );

  // Supply Roles (Unit-specific)
  const staffBob = await assignRole(
    'staff_bob',
    'Bob Smith',
    UserRole.GENERAL_STAFF,
    deptSUPOPS.id,
    'UNIT-PROC-1'
  );

  await assignRole(
    'staff_bob',
    'Bob Smith',
    UserRole.GUEST,
    'DEPT-FIN',
    'UNIT-SUP'
  );

  const staffAlice = await assignRole(
    'staff_alice',
    'Alice Jones',
    UserRole.GENERAL_STAFF,
    deptSUPOPS.id,
    'UNIT-PROC-2'
  );

  await assignRole(
    'staff_alice',
    'Alice Jones',
    UserRole.GUEST,
    'DEPT-FIN',
    'UNIT-SUP'
  );

  const staffCathy = await assignRole(
    'staff_cathy',
    'Cathy Williams',
    UserRole.GENERAL_STAFF,
    deptSUPOPS.id,
    'UNIT-CONT'
  );

  await assignRole(
    'staff_cathy',
    'Cathy Williams',
    UserRole.GUEST,
    'DEPT-FIN',
    'UNIT-SUP'
  );

  // External Roles
  const repCharlie = await assignRole(
    'rep_charlie',
    'Charlie Rep',
    UserRole.REPRESENTATIVE,
    deptLOC.id,
    'UNIT-BUILD'
  );

  const rep_kevin = await assignRole(
    'rep_kevin',
    'Kevin Rep',
    UserRole.REPRESENTATIVE,
    deptLOC.id,
    'UNIT-MAINT'
  );

  const regSam = await assignRole(
    'reg_sam',
    'Sam Registration',
    UserRole.GENERAL_STAFF,
    deptREG.id
  );

  const stuAffEmily = await assignRole(
    'stu_emily',
    'Emily StudentAffairs',
    UserRole.REPRESENTATIVE,
    deptSTUAFF.id,
    'UNIT-EDU'
  );

  await assignRole(
    'stu_emily',
    'Emily StudentAffairs',
    UserRole.REPRESENTATIVE,
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
    // ---------------------------------------------------------
    // 1. New Server Purchase 2026
    // Requesting: DEPT-LOC / UNIT-BUILD (Charlie)
    // ---------------------------------------------------------
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
      created_by: repCharlie.id, // Updated: Charlie requests for Building
      assignee_procurement: { connect: [{ id: staffBob.id }] },
      is_urgent: UrgentType.URGENT,
      expected_approval_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    },

    // ---------------------------------------------------------
    // 2. Cloud Infrastructure Upgrade
    // Requesting: DEPT-FIN / UNIT-SUP (Lisa - Finance Proxy)
    // ---------------------------------------------------------
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
      created_by: finStaff.id, // Updated: Lisa (Finance Staff) requests
      assignee_procurement: { connect: [{ id: staffAlice.id }] },
      is_urgent: UrgentType.NORMAL,
    },

    // ---------------------------------------------------------
    // 3. Office Renovation
    // Requesting: DEPT-STUAFF / UNIT-EDU (Emily)
    // ---------------------------------------------------------
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
      created_by: stuAffEmily.id, // Updated: Emily requests for Student Affairs
      assignee_procurement: { connect: [{ id: staffAlice.id }] },
      assignee_contract: { connect: [{ id: staffCathy.id }] },
      is_urgent: UrgentType.NORMAL,
    },

    // ---------------------------------------------------------
    // 4. Quarterly Cleaning Supplies 2026
    // Requesting: DEPT-LOC / UNIT-MAINT (Kevin)
    // ---------------------------------------------------------
    {
      title: 'Quarterly Cleaning Supplies 2026',
      receive_no: '4',
      budget: 45000.0,
      status: ProjectStatus.IN_PROGRESS,
      procurement_type: ProcurementType.LT100K,
      current_workflow_type: UnitResponsibleType.LT100K,
      responsible_unit_id: 'UNIT-PROC-1',
      requesting_dept_id: deptLOC.id,
      requesting_unit_id: 'UNIT-MAINT',
      created_by: rep_kevin.id, // Updated: Kevin requests for Maintenance
      assignee_procurement: { connect: [{ id: staffBob.id }] },
      is_urgent: UrgentType.NORMAL,
    },

    // ---------------------------------------------------------
    // 5. Annual Student Festival Stage Construction
    // Requesting: DEPT-STUAFF / UNIT-NET (Emily)
    // ---------------------------------------------------------
    {
      title: 'Annual Student Festival Stage Construction',
      receive_no: '5',
      budget: 1200000.0,
      status: ProjectStatus.IN_PROGRESS,
      procurement_type: ProcurementType.EBIDDING,
      current_workflow_type: UnitResponsibleType.EBIDDING,
      responsible_unit_id: 'UNIT-PROC-2',
      requesting_dept_id: deptSTUAFF.id,
      requesting_unit_id: 'UNIT-NET',
      created_by: stuAffEmily.id, // Updated: Emily requests
      assignee_procurement: { connect: [{ id: staffAlice.id }] },
      is_urgent: UrgentType.NORMAL,
      expected_approval_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },

    // ---------------------------------------------------------
    // 6. Emergency Pipe Repair - Building A
    // Requesting: DEPT-LOC / UNIT-BUILD (Charlie)
    // ---------------------------------------------------------
    {
      title: 'Emergency Pipe Repair - Building A',
      receive_no: '6',
      budget: 85000.0,
      status: ProjectStatus.IN_PROGRESS,
      procurement_type: ProcurementType.LT100K,
      current_workflow_type: UnitResponsibleType.LT100K,
      responsible_unit_id: 'UNIT-PROC-1',
      requesting_dept_id: deptLOC.id,
      requesting_unit_id: 'UNIT-BUILD',
      created_by: repCharlie.id, // Updated: Charlie requests
      assignee_procurement: { connect: [{ id: staffBob.id }] },
      is_urgent: UrgentType.URGENT,
    },

    // ---------------------------------------------------------
    // 7. Security Guard Services Outsourcing
    // Requesting: DEPT-LOC / UNIT-BUILD (Charlie)
    // ---------------------------------------------------------
    {
      title: 'Security Guard Services Outsourcing 2026-2027',
      receive_no: '7',
      budget: 2400000.0,
      status: ProjectStatus.IN_PROGRESS,
      procurement_type: ProcurementType.SELECTION,
      current_workflow_type: UnitResponsibleType.CONTRACT,
      responsible_unit_id: 'UNIT-CONT',
      requesting_dept_id: deptLOC.id,
      requesting_unit_id: 'UNIT-BUILD',
      created_by: repCharlie.id, // Updated: Charlie requests
      assignee_procurement: { connect: [{ id: staffAlice.id }] },
      assignee_contract: { connect: [{ id: staffCathy.id }] },
      is_urgent: UrgentType.NORMAL,
    },

    // ---------------------------------------------------------
    // 8. A4 Paper Bulk Order
    // Requesting: DEPT-REG (Sam)
    // ---------------------------------------------------------
    {
      title: 'A4 Paper Bulk Order for Registration',
      receive_no: '8',
      budget: 200000.0,
      status: ProjectStatus.IN_PROGRESS,
      procurement_type: ProcurementType.LT500K,
      current_workflow_type: UnitResponsibleType.LT500K,
      responsible_unit_id: 'UNIT-PROC-1',
      requesting_dept_id: deptREG.id,
      requesting_unit_id: null,
      created_by: regSam.id, // Updated: Sam requests for Registration
      assignee_procurement: { connect: [{ id: staffBob.id }] },
      is_urgent: UrgentType.NORMAL,
    },

    // ---------------------------------------------------------
    // 9. ERP System License Renewal
    // Requesting: DEPT-FIN / UNIT-ACC (Lisa)
    // ---------------------------------------------------------
    {
      title: 'ERP System License Renewal',
      receive_no: '9',
      budget: 650000.0,
      status: ProjectStatus.IN_PROGRESS,
      procurement_type: ProcurementType.SELECTION,
      current_workflow_type: UnitResponsibleType.SELECTION,
      responsible_unit_id: 'UNIT-PROC-2',
      requesting_dept_id: deptFIN.id,
      requesting_unit_id: 'UNIT-ACC',
      created_by: finStaff.id, // Updated: Lisa requests
      assignee_procurement: { connect: [{ id: staffAlice.id }] },
      is_urgent: UrgentType.NORMAL,
    },

    // ---------------------------------------------------------
    // 10. Freshmen Orientation Welcome Kits
    // Requesting: DEPT-STUAFF / UNIT-EDU (Emily)
    // ---------------------------------------------------------
    {
      title: 'Freshmen Orientation Welcome Kits',
      receive_no: '10',
      budget: 120000.0,
      status: ProjectStatus.CLOSED,
      procurement_type: ProcurementType.LT500K,
      current_workflow_type: UnitResponsibleType.LT500K,
      responsible_unit_id: 'UNIT-PROC-1',
      requesting_dept_id: deptSTUAFF.id,
      requesting_unit_id: 'UNIT-EDU',
      created_by: stuAffEmily.id, // Updated: Emily requests
      assignee_procurement: { connect: [{ id: staffBob.id }] },
      is_urgent: UrgentType.NORMAL,
      expected_approval_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    },
  ];

  let createdProject = [];

  for (const p of projects) {
    const created = await prisma.project.create({ data: p });
    createdProject.push(created);
  }

  // 7. SUBMISSIONS & DOCUMENTS
  // ---------------------------------------------------------
  // 7. SEED SUBMISSIONS (HISTORY)
  // ---------------------------------------------------------

  // Fetch projects with their assignees to determine "who" submitted
  const allProjects = await prisma.project.findMany({
    include: {
      assignee_procurement: true,
      assignee_contract: true,
    },
  });

  for (const project of allProjects) {
    const wfType = project.current_workflow_type as UnitResponsibleType;
    const steps = WORKFLOW_STEP_ORDERS[wfType] || [];

    // 1. Determine the Submitter
    // Logic: If in Contract phase, the Contract Staff submits. Otherwise, Procurement Staff.
    let submitterId = project.created_by; // Fallback to creator

    if (wfType === UnitResponsibleType.CONTRACT) {
      if (project.assignee_contract.length > 0) {
        submitterId = project.assignee_contract[0].id; // e.g., Cathy
      }
    } else {
      if (project.assignee_procurement.length > 0) {
        submitterId = project.assignee_procurement[0].id; // e.g., Bob or Alice
      }
    }

    // 2. Determine how many steps are "Done"
    let stepsToComplete = 0;

    if (project.status === ProjectStatus.CLOSED) {
      // If project is done, ALL steps must be completed
      stepsToComplete = steps.length;
    } else {
      // If in progress, randomize progress (e.g., complete 1 to N-1 steps)
      // ensuring at least 1 step is done, but not all (so it stays in progress)
      if (steps.length > 1) {
        stepsToComplete = Math.floor(Math.random() * (steps.length - 1)) + 1;
      } else {
        stepsToComplete = 0; // Just started, no steps done
      }
    }

    // 3. Create the Submission Records
    for (let i = 0; i < stepsToComplete; i++) {
      const stepNum = steps[i];

      await prisma.projectSubmission.create({
        data: {
          project_id: project.id,
          workflow_type: wfType,
          step_order: stepNum,
          submission_round: 1, // Default to round 1
          status: SubmissionStatus.COMPLETED,
          submitted_by: submitterId,
          // Mock a document for every step
          documents: {
            create: [
              {
                file_name: `doc_step_${stepNum}.pdf`,
                file_path: `/uploads/${project.receive_no}/${wfType}/step_${stepNum}.pdf`,
              },
            ],
          },
        },
      });
    }
  }

  // ---------------------------------------------------------
  // 8. BUDGET PLANS (Optional, can be expanded similarly)
  // ---------------------------------------------------------

  // Example: Create some budget plans (optional)
  await prisma.budgetPlan.create({
    data: {
      cost_center_name: 'ฝ่ายการพัสดุ',
      cost_center_no: '1010803000',
      department_id: deptFIN.id,
      activity_type: 'ระบบติตดาม',
      activity_type_name: 'ระบบติดตามสถานะการจัดซื้อจัดจ้าง',
      description: 'ระบบติดตามสถานะการจัดซื้อจัดจ้างและการบริหารสัญญา',
      budget_amount: 1000000,
      budget_year: '2026',
      created_by: superAdmin.id,
    },
  });

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
