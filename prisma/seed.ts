import {
  ProjectStatus,
  ProcurementType,
  SubmissionStatus,
  UnitResponsibleType,
} from '../generated/prisma/client';

import { prisma } from '../src/config/prisma';

async function main() {
  console.log('--- Start Seeding ---');

  // 1. Create Department
  const dept = await prisma.department.create({
    data: {
      name: 'Office of Supply',
      code: '001',
    },
  });

  // 2. Create Unit
  const unit1 = await prisma.unit.create({
    data: {
      name: 'Procurement 1',
      type: [UnitResponsibleType.LT100K, UnitResponsibleType.LT500K],
      dept_id: dept.id,
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
      dept_id: dept.id,
    },
  });
  const unit3 = await prisma.unit.create({
    data: {
      name: 'Contract',
      type: [UnitResponsibleType.CONTRACT],
      dept_id: dept.id,
    },
  });

  // 3. Create Users
  const adminUser = await prisma.user.create({
    data: {
      username: 'admin_jane',
      email: 'jane.doe@company.com',
      full_name: 'Jane Doe',
      role: 'ADMIN',
      unit_id: unit1.id,
    },
  });

  const managerUser = await prisma.user.create({
    data: {
      username: 'manager_mike',
      email: 'mike.manager@company.com',
      full_name: 'Mike Manager',
      role: 'MANAGER',
      unit_id: unit1.id,
    },
  });

  const staffUser = await prisma.user.create({
    data: {
      username: 'staff_bob',
      email: 'bob.smith@company.com',
      full_name: 'Bob Smith',
      role: 'STAFF',
      unit_id: unit1.id,
    },
  });

  const staff2User = await prisma.user.create({
    data: {
      username: 'staff_alice',
      email: 'alice.jones@company.com',
      full_name: 'Alice Jones',
      role: 'STAFF',
      unit_id: unit2.id,
    },
  });

  const staff3User = await prisma.user.create({
    data: {
      username: 'staff_cathy',
      email: 'cathy.williams@company.com',
      full_name: 'Cathy Williams',
      role: 'STAFF',
      unit_id: unit3.id,
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
