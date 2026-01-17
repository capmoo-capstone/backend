import {
  ProjectStatus,
  ProcurementType,
  SubmissionStatus,
} from '../generated/prisma/client';

import { prisma } from '../src/config/prisma';

async function main() {
  console.log('--- Start Seeding ---');

  // 1. Create Department
  const deptIT = await prisma.department.create({
    data: {
      name: 'Information Technology',
      code: 'IT-001',
    },
  });

  // 2. Create Unit
  const unitSoftware = await prisma.unit.create({
    data: {
      name: 'Software Development',
      type: 'Technical',
      dept_id: deptIT.id,
    },
  });

  // 3. Create Users
  const adminUser = await prisma.user.create({
    data: {
      username: 'admin_jane',
      email: 'jane.doe@company.com',
      full_name: 'Jane Doe',
      role: 'ADMIN',
      unit_id: unitSoftware.id,
    },
  });

  const staffUser = await prisma.user.create({
    data: {
      username: 'staff_bob',
      email: 'bob.smith@company.com',
      full_name: 'Bob Smith',
      role: 'STAFF',
      unit_id: unitSoftware.id,
    },
  });

  const staff2User = await prisma.user.create({
    data: {
      username: 'staff_alice',
      email: 'alice.jones@company.com',
      full_name: 'Alice Jones',
      role: 'STAFF',
      unit_id: unitSoftware.id,
    },
  });

  // 4. Create Workflow Template & Steps
  const template = await prisma.workflowTemplate.create({
    data: {
      name: 'Standard Procurement',
      type: 'PROCUREMENT',
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
      status: ProjectStatus.UNASSIGNED,
      procurement_type: ProcurementType.LT500K,
      current_templates_id: template.id,
      current_step_id: template.steps[0].id,
      created_by: adminUser.id,
      is_urgent: true,
      vendor_name: 'TechCorp Solutions',
      vendor_email: 'sales@techcorp.com',
    },
    {
      title: 'New Server Purchase 2026/2',
      receive_no: '2',
      budget: 750000.0,
      status: ProjectStatus.WAITING_FOR_ACCEPTANCE,
      procurement_type: ProcurementType.MT500K,
      current_templates_id: template.id,
      current_step_id: template.steps[0].id,
      created_by: adminUser.id,
      assignee_procurement_id: staffUser.id,
      is_urgent: false,
      vendor_name: 'Spectra Tech Inc.',
      vendor_email: 'sales@spectratech.com',
    },
    {
      title: 'Cloud Purchase 2026',
      receive_no: '3',
      budget: 300000.0,
      status: ProjectStatus.IN_PROGRESS_OF_PROCUREMENT,
      procurement_type: ProcurementType.LT500K,
      current_templates_id: template.id,
      current_step_id: template.steps[0].id,
      created_by: adminUser.id,
      assignee_procurement_id: staff2User.id,
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
      step_id: template.steps[0].id,
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
