import {
  ProjectStatus,
  ProcurementType,
  SubmissionStatus,
  UnitResponsibleType,
  UserRole,
} from '../generated/prisma/client';

import { prisma } from '../src/config/prisma';

async function main() {
  console.log('--- Start Seeding ---');

  // 1. Create Department
  const deptPCM = await prisma.department.create({
    data: {
      name: 'Office of Supply',
      code: 'SUPPLY',
      allowed_role: {
        create: [
          { role: UserRole.ADMIN },
          { role: UserRole.HEAD_OF_DEPARTMENT },
          { role: UserRole.HEAD_OF_UNIT },
          { role: UserRole.DOCUMENT_STAFF },
          { role: UserRole.FINANCE_STAFF },
          { role: UserRole.GENERAL_STAFF },
        ],
      },
    },
  });

  const deptREG = await prisma.department.create({
    data: {
      name: 'Office of Registration',
      code: 'REGISTRATION',
      allowed_role: {
        create: [
          { role: UserRole.HEAD_OF_DEPARTMENT },
          { role: UserRole.HEAD_OF_UNIT },
          { role: UserRole.GENERAL_STAFF },
        ],
      },
    },
  });

  const deptENG = await prisma.department.create({
    data: {
      name: 'Faculty of Engineering',
      code: 'ENGINEERING',
      allowed_role: {
        create: [
          { role: UserRole.HEAD_OF_DEPARTMENT },
          { role: UserRole.HEAD_OF_UNIT },
          { role: UserRole.REPRESENTATIVE },
          { role: UserRole.GENERAL_STAFF },
        ],
      },
    },
  });

  // 2. Create Unit
  const unit1 = await prisma.unit.create({
    data: {
      name: 'Procurement 1',
      type: [UnitResponsibleType.LT100K, UnitResponsibleType.LT500K],
      dept_id: deptPCM.id,
    },
  });
  const unit2 = await prisma.unit.create({
    data: {
      name: 'Procurement 2',
      type: [
        UnitResponsibleType.MT500K,
        UnitResponsibleType.SELECTION,
        UnitResponsibleType.EBIDDING,
      ],
      dept_id: deptPCM.id,
    },
  });
  const unit3 = await prisma.unit.create({
    data: {
      name: 'Contract',
      type: [UnitResponsibleType.CONTRACT],
      dept_id: deptPCM.id,
    },
  });
  const engineeringUnit = await prisma.unit.create({
    data: {
      name: 'Engineering Unit',
      type: [],
      dept_id: deptENG.id,
    },
  });

  // 3. Create Users
  const superAdmin = await prisma.user.create({
    data: {
      username: 'super',
      full_name: 'Super Admin',
      role: UserRole.SUPER_ADMIN,
    },
  });

  const adminUser = await prisma.user.create({
    data: {
      username: 'admin_jane',
      email: 'jane.doe@company.com',
      full_name: 'Jane Doe',
      role: UserRole.ADMIN,
      dept_id: deptPCM.id,
      unit_id: unit1.id,
    },
  });

  const headOfUnitUser = await prisma.user.create({
    data: {
      username: 'HeadUnit1_mike',
      full_name: 'Mike HeadUnit',
      role: UserRole.HEAD_OF_UNIT,
      dept_id: deptPCM.id,
      unit_id: unit1.id,
    },
  });

  const staffUser = await prisma.user.create({
    data: {
      username: 'staff_bob',
      full_name: 'Bob Smith',
      role: UserRole.GENERAL_STAFF,
      dept_id: deptPCM.id,
      unit_id: unit1.id,
    },
  });

  const staff2User = await prisma.user.create({
    data: {
      username: 'staff_alice',
      full_name: 'Alice Jones',
      role: UserRole.GENERAL_STAFF,
      dept_id: deptPCM.id,
      unit_id: unit2.id,
    },
  });

  const staff3User = await prisma.user.create({
    data: {
      username: 'staff_cathy',
      full_name: 'Cathy Williams',
      role: UserRole.GENERAL_STAFF,
      dept_id: deptPCM.id,
      unit_id: unit3.id,
    },
  });

  const regUser = await prisma.user.create({
    data: {
      username: 'reg_sam',
      full_name: 'Sam Registration',
      role: UserRole.GENERAL_STAFF,
      dept_id: deptREG.id,
    },
  });

  const representativeUser = await prisma.user.create({
    data: {
      username: 'rep_charlie',
      full_name: 'Charlie Rep',
      role: UserRole.REPRESENTATIVE,
      dept_id: deptENG.id,
      unit_id: engineeringUnit.id,
    },
  });

  // 4. Create Workflow Template & Steps
  const procurement1 = await prisma.workflowTemplate.create({
    data: {
      name: 'LT500K Procurement',
      type: UnitResponsibleType.LT500K,
      description: 'Default flow for purchasing equipment',
      steps: {
        create: [
          {
            name: 'Initial Request',
            order: 1,
            description: 'Staff submits the request',
            required_step: [],
            required_documents: [],
          },
          {
            name: 'Manager Approval',
            order: 2,
            description: 'Department head reviews',
            required_step: [1],
            required_documents: [],
          },
        ],
      },
    },
    include: { steps: true },
  });

  const procurement2 = await prisma.workflowTemplate.create({
    data: {
      name: 'MT500K Procurement',
      type: UnitResponsibleType.MT500K,
      steps: {
        create: [
          {
            name: 'จัดทำแผนจัดการจัดซื้อจัดจ้าง และจัดทำคำสั่งแต่งตั้งคณะกรรมการฯ TOR',
            order: 1,
            description: '',
            required_step: [],
            required_documents: [
              {
                field_key: 'mt500k_procurement_plan_file',
                label: 'แผนการจัดซื้อจัดจ้าง',
                type: 'FILE_UPLOAD',
                is_required: false,
              },
              {
                field_key: 'mt500k_tor_committee_appt_file',
                label: 'คำสั่งแต่งตั้งคณะกรรมการจัดทำขอบเขตของงาน (TOR)',
                type: 'FILE_UPLOAD',
                is_required: false,
              },
            ],
          },
          {
            name: 'จัดทำรายงานขอซื้อหรือขอจ้าง, คำสั่งแต่งตั้งคณะกรรมการซื้อหรือจ้าง และหนังสือเชิญชวน',
            order: 2,
            description: '',
            required_step: [1],
            required_documents: [
              {
                field_key: 'mt500k_requisition_report_file',
                label: 'รายงานขอซื้อ/จ้าง',
                type: 'FILE_UPLOAD',
                is_required: false,
              },
              {
                field_key: 'mt500k_procurement_committee_file',
                label: 'คำสั่งแต่งตั้งคณะกรรมการซื้อ/จ้าง',
                type: 'FILE_UPLOAD',
                is_required: false,
              },
              {
                field_key: 'mt500k_invitation_letter_file',
                label: 'หนังสือเชิญชวน',
                type: 'FILE_UPLOAD',
                is_required: false,
              },
            ],
          },
          {
            name: 'จัดทำรายงานผลการพิจารณาจัดซื้อจัดจ้าง, รายงานผลฯ อนุมัติ ประกาศผู้ชนะ และหนังสือสนองรับราคาฯ',
            order: 3,
            description: '',
            required_step: [1],
            required_documents: [
              {
                field_key: 'mt500k_consideration_report_file',
                label: 'รายงานผลการพิจารณาและอนุมัติสั่งซื้อ/จ้าง',
                type: 'FILE_UPLOAD',
                is_required: false,
              },
              {
                field_key: 'mt500k_winner_announcement_file',
                label: 'ประกาศผู้ชนะการเสนอราคา',
                type: 'FILE_UPLOAD',
                is_required: false,
              },
              {
                field_key: 'mt500k_contract_notice_file',
                label: 'หนังสือแจ้งให้มาลงนามในสัญญา',
                type: 'FILE_UPLOAD',
                is_required: false,
              },
              {
                field_key: 'mt500k_pr_number',
                label: 'เลขที่ใบขอซื้อ (PR Number)',
                type: 'TEXT_INPUT',
                is_required: true,
              },
            ],
          },
          {
            name: 'จัดทำร่างสัญญา / ใบสั่งซื้อสั่งจ้าง / หนังสือข้อตกลง',
            order: 4,
            description: '',
            required_step: [3],
            required_documents: [
              {
                field_key: 'mt500k_contract_doc_file',
                label: 'สัญญา / ใบสั่งซื้อสั่งจ้าง / หนังสือข้อตกลง',
                type: 'FILE_UPLOAD',
                is_required: false,
              },
              {
                field_key: 'mt500k_po_number',
                label: 'เลขที่ใบสั่งซื้อ (PO Number)',
                type: 'TEXT_INPUT',
                is_required: true,
              },
            ],
          },
        ],
      },
    },
    include: { steps: true },
  });

  const contract = await prisma.workflowTemplate.create({
    data: {
      name: 'Contract Workflow',
      type: UnitResponsibleType.CONTRACT,
      description: 'Default flow for purchasing equipment',
      steps: {
        create: [
          {
            name: 'Initial Request',
            order: 1,
            description: 'Staff submits the request',
            required_step: [],
            required_documents: [],
          },
          {
            name: 'Manager Approval',
            order: 2,
            description: 'Department head reviews',
            required_step: [1],
            required_documents: [],
          },
        ],
      },
    },
    include: { steps: true },
  });

  // 5. Create a Project
  const projectData = [
    {
      title: 'New Server Purchase 2026',
      receive_no: '1',
      budget: 150000.0,
      status: ProjectStatus.IN_PROGRESS,
      procurement_type: ProcurementType.LT500K,
      current_template_id: procurement1.id,
      current_step_id: procurement1.steps[1].id,
      created_by: adminUser.id,
      assignee_procurement_id: staffUser.id,
      is_urgent: true,
      expected_approval_date: new Date('2026-02-15'),
    },
    {
      title: 'New Server Purchase 2026/2',
      receive_no: '2',
      budget: 750000.0,
      status: ProjectStatus.IN_PROGRESS,
      procurement_type: ProcurementType.MT500K,
      current_template_id: procurement2.id,
      current_step_id: procurement2.steps[0].id,
      assignee_procurement_id: staff2User.id,
      created_by: adminUser.id,
      is_urgent: false,
    },
    {
      title: 'Cloud Purchase 2026',
      receive_no: '3',
      budget: 300000.0,
      status: ProjectStatus.UNASSIGNED,
      procurement_type: ProcurementType.LT500K,
      current_template_id: procurement1.id,
      created_by: adminUser.id,
      is_urgent: false,
    },
  ];

  await prisma.project.createMany({ data: projectData });

  const projects = await prisma.project.findMany({
    where: { created_by: adminUser.id },
    orderBy: { receive_no: 'asc' },
  });

  // 6. Create Project Submission & Document
  await prisma.projectSubmission.create({
    data: {
      project_id: projects[0].id,
      step_id: procurement1.steps[0].id,
      submission_round: 1,
      status: SubmissionStatus.COMPLETED,
      submitted_by: adminUser.id,
      meta_data: { browser: 'Chrome', ip: '192.168.1.1' },
      documents: {
        create: [
          {
            file_name: 'quotation_v1.pdf',
            file_path: '/uploads/projects/quotation_v1.pdf',
          },
        ],
      },
    },
  });

  await prisma.projectSubmission.create({
    data: {
      project_id: projects[1].id,
      step_id: procurement2.steps[0].id,
      submission_round: 1,
      status: SubmissionStatus.SUBMITTED,
      submitted_by: staff2User.id,
      meta_data: {},
      documents: {
        create: [
          {
            field_key: 'mt500k_procurement_plan_file',
            file_name: 'procurement_plan.pdf',
            file_path: '/uploads/projects/procurement_plan.pdf',
          },
          {
            field_key: 'mt500k_tor_committee_appt_file',
            file_name: 'tor_document.pdf',
            file_path: '/uploads/projects/tor_document.pdf',
          },
        ],
      },
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
