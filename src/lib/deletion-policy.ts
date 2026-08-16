import { Prisma, ProjectStatus } from '@prisma/client';
import { BadRequestError } from './errors';

type DeletionClient = Prisma.TransactionClient;

export const assertUnitCanBeDeleted = async (
  tx: DeletionClient,
  unitId: string
): Promise<void> => {
  const [budgetPlans, roles, requestingProjects, responsibleProjects] =
    await Promise.all([
      tx.budgetPlan.count({ where: { unit_id: unitId } }),
      tx.userOrganizationRole.count({ where: { unit_id: unitId } }),
      tx.project.count({ where: { requesting_unit_id: unitId } }),
      tx.project.count({ where: { responsible_unit_id: unitId } }),
    ]);
  if (budgetPlans || roles || requestingProjects || responsibleProjects) {
    throw new BadRequestError(
      'Unit cannot be deleted while it is still in use'
    );
  }
};

export const assertDepartmentCanBeDeleted = async (
  tx: DeletionClient,
  departmentId: string
): Promise<void> => {
  const [units, roles, projects, registrations] = await Promise.all([
    tx.unit.count({ where: { dept_id: departmentId } }),
    tx.userOrganizationRole.count({ where: { dept_id: departmentId } }),
    tx.project.count({ where: { requesting_dept_id: departmentId } }),
    tx.registrationRequest.count({ where: { dept_id: departmentId } }),
  ]);
  if (units || roles || projects || registrations) {
    throw new BadRequestError(
      'Department cannot be deleted while it is still in use'
    );
  }
};

export const assertUserCanBeDeleted = async (
  tx: DeletionClient,
  userId: string
): Promise<void> => {
  const [
    roles,
    delegations,
    projects,
    submissions,
    installments,
    cancellations,
    notifications,
    deliveries,
  ] = await Promise.all([
    tx.userOrganizationRole.count({ where: { user_id: userId } }),
    tx.userDelegation.count({
      where: {
        OR: [
          { delegator_id: userId },
          { delegatee_id: userId },
          { created_by: userId },
          { cancelled_by: userId },
        ],
      },
    }),
    tx.project.count({ where: { created_by: userId } }),
    tx.projectSubmission.count({
      where: {
        OR: [
          { submitted_by: userId },
          { approved_by: userId },
          { proposing_by: userId },
          { completed_by: userId },
        ],
      },
    }),
    tx.projectInstallment.count({
      where: { OR: [{ created_by: userId }, { exported_by: userId }] },
    }),
    tx.projectCancellation.count({
      where: { OR: [{ requested_by: userId }, { decision_by: userId }] },
    }),
    tx.notification.count({ where: { user_id: userId } }),
    tx.notificationDelivery.count({ where: { user_id: userId } }),
  ]);
  if (
    roles ||
    delegations ||
    projects ||
    submissions ||
    installments ||
    cancellations ||
    notifications ||
    deliveries
  ) {
    throw new BadRequestError(
      'User cannot be deleted while it has related records'
    );
  }
};

export const assertProjectCanBeDeleted = async (
  tx: DeletionClient,
  projectId: string
): Promise<void> => {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { status: true },
  });
  if (!project) return;
  if (project.status !== ProjectStatus.UNASSIGNED) {
    throw new BadRequestError('Only unassigned projects can be deleted');
  }

  const [submissions, histories, cancellations, installments, notifications] =
    await Promise.all([
      tx.projectSubmission.count({ where: { project_id: projectId } }),
      tx.projectHistory.count({ where: { project_id: projectId } }),
      tx.projectCancellation.count({ where: { project_id: projectId } }),
      tx.projectInstallment.count({ where: { project_id: projectId } }),
      tx.notification.count({ where: { project_id: projectId } }),
    ]);
  if (
    submissions ||
    histories ||
    cancellations ||
    installments ||
    notifications
  ) {
    throw new BadRequestError(
      'Project cannot be deleted after workflow activity has begun'
    );
  }
};
