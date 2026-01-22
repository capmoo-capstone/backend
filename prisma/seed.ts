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
      name: 'Office of Procurement',
      code: 'PROCUREMENT',
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
          { role: UserRole.ADMIN },
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
          { role: UserRole.ADMIN },
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
            required_documents: { docs: ['ID Card', 'Quotation'] },
          },
          {
            name: 'Manager Approval',
            order: 2,
            description: 'Department head reviews',
            required_step: [1],
            required_documents: { docs: ['Approval Letter'] },
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
      description: 'Default flow for purchasing equipment',
      steps: {
        create: [
          {
            name: 'Initial Request',
            order: 1,
            description: 'Staff submits the request',
            required_step: [],
            required_documents: { docs: ['ID Card', 'Quotation'] },
          },
          {
            name: 'Manager Approval',
            order: 2,
            description: 'Department head reviews',
            required_step: [1],
            required_documents: { docs: ['Approval Letter'] },
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
            required_documents: { docs: ['ID Card', 'Quotation'] },
          },
          {
            name: 'Manager Approval',
            order: 2,
            description: 'Department head reviews',
            required_step: [1],
            required_documents: { docs: ['Approval Letter'] },
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
      status: ProjectStatus.PROCUREMENT_UNASSIGNED,
      procurement_type: ProcurementType.LT500K,
      current_templates_id: procurement1.id,
      created_by: adminUser.id,
      is_urgent: true,
      expect_approved_date: new Date('2026-02-15'),
      vendor_name: 'TechCorp Solutions',
      vendor_email: 'sales@techcorp.com',
    },
    {
      title: 'New Server Purchase 2026/2',
      receive_no: '2',
      budget: 750000.0,
      status: ProjectStatus.PROCUREMENT_UNASSIGNED,
      procurement_type: ProcurementType.MT500K,
      current_templates_id: procurement2.id,
      created_by: adminUser.id,
      is_urgent: false,
      vendor_name: 'Spectra Tech Inc.',
      vendor_email: 'sales@spectratech.com',
    },
    {
      title: 'Cloud Purchase 2026',
      receive_no: '3',
      budget: 300000.0,
      status: ProjectStatus.PROCUREMENT_IN_PROGRESS,
      procurement_type: ProcurementType.LT500K,
      current_templates_id: procurement1.id,
      current_step_id: procurement1.steps[1].id,
      created_by: adminUser.id,
      assignee_procurement_id: staffUser.id,
      is_urgent: false,
      vendor_name: 'ProCloud Services',
      vendor_email: 'sales@procloudservices.com',
    },
  ];

  await prisma.project.createMany({ data: projectData });

  const projects = await prisma.project.findMany({
    where: { created_by: adminUser.id },
    orderBy: { id: 'asc' },
  });

  // 6. Create Project Submission & Document
  await prisma.projectSubmission.create({
    data: {
      project_id: projects[0].id,
      step_id: procurement1.steps[0].id,
      submission_round: '1',
      status: SubmissionStatus.SUBMITTED,
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
