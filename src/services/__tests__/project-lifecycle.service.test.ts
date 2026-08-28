import { ProjectStatus, UnitResponsibleType, UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTRACT_UNIT_ID, OPS_DEPT_ID } from '../../utils/constant';
import { txMock } from '../../test/prisma-mock';
import {
  approveCancellation,
  cancelProject,
  closeProject,
  completeProcurementPhase,
  rejectCancellation,
} from '../project-lifecycle.service';

const staffUser = {
  id: 'staff-1',
  full_name: 'Staff One',
  is_delegated: false,
  delegated_by: [],
  roles: [
    { role: UserRole.GENERAL_STAFF, dept_id: OPS_DEPT_ID, unit_id: 'unit-1' },
    { role: UserRole.SUPER_ADMIN, dept_id: OPS_DEPT_ID, unit_id: null },
  ],
} as any;

const headUser = {
  id: 'head-1',
  full_name: 'Head User',
  is_delegated: false,
  delegated_by: [],
  roles: [
    { role: UserRole.HEAD_OF_DEPARTMENT, dept_id: OPS_DEPT_ID, unit_id: null },
    { role: UserRole.SUPER_ADMIN, dept_id: OPS_DEPT_ID, unit_id: null },
  ],
} as any;

describe('project-lifecycle.service', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
  });

  it('cancelProject creates a waiting-cancel request for non-head users', async () => {
    txMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      status: ProjectStatus.IN_PROGRESS,
      title: 'Project 1',
      receive_no: '2569/00001',
      responsible_unit_id: 'unit-1',
      created_by: 'user-1',
      assignee_procurement: [],
      assignee_contract: [],
      creator: { id: 'user-1', full_name: 'User One', email: null },
    });
    txMock.projectCancellation.findFirst.mockResolvedValue(null);
    txMock.project.update.mockResolvedValue({
      id: 'project-1',
      status: ProjectStatus.WAITING_CANCEL,
    });
    txMock.projectCancellation.create.mockResolvedValue({
      id: 'cancellation-1',
      project_id: 'project-1',
      reason: 'Need cancellation',
      status: 'PENDING',
      requested_at: new Date('2026-06-01T00:00:00.000Z'),
      decision_by: null,
      decision_at: null,
    });
    txMock.userOrganizationRole.findMany.mockResolvedValue([
      {
        user: { id: 'head-unit-1', full_name: 'Head Unit', email: null },
      },
    ]);
    txMock.userDelegation.findMany.mockResolvedValue([]);
    txMock.user.findMany.mockImplementation(async (args: any) => {
      const ids = args?.where?.id?.in ?? [];
      return ids.map((id: string) => ({ id }));
    });
    txMock.notification.findFirst.mockResolvedValue(null);
    txMock.notification.create.mockResolvedValue({
      id: 'notification-1',
      user_id: 'head-unit-1',
      project_id: 'project-1',
      category: 'CANCELLATIONS',
      priority: 'HIGH',
      title: 'cancel request',
      body: 'cancel request',
      target_path: '/app/projects/project-1',
      action_label: 'review',
      requires_action: true,
      is_read: false,
      read_at: null,
      created_at: new Date('2026-06-01T00:00:00.000Z'),
      metadata: { notification_kind: 'CANCEL_REQUESTED' },
    });
    txMock.notification.groupBy.mockResolvedValue([
      { user_id: 'head-unit-1', _count: { _all: 1 } },
    ]);

    const result = await cancelProject(staffUser, {
      id: 'project-1',
      reason: 'Need cancellation',
    });

    expect(result.status).toBe('PENDING');
    expect(txMock.project.update).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      data: { status: ProjectStatus.WAITING_CANCEL },
      select: { id: true, status: true },
    });
    expect(txMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: 'head-unit-1',
          category: 'CANCELLATIONS',
          dedupe_key: 'cancel-request:project-1',
        }),
      })
    );
  });

  it('cancelProject directly cancels projects for head-of-supply users', async () => {
    txMock.project.findUnique.mockResolvedValue({
      status: ProjectStatus.IN_PROGRESS,
    });
    txMock.projectCancellation.findFirst.mockResolvedValue(null);
    txMock.projectCancellation.create.mockResolvedValue({
      id: 'cancellation-1',
      project_id: 'project-1',
      reason: 'Approved cancellation',
      status: 'APPROVED',
      requested_at: new Date('2026-06-01T00:00:00.000Z'),
      decision_by: headUser.id,
      decision_at: new Date('2026-06-01T00:00:00.000Z'),
    });

    const result = await cancelProject(headUser, {
      id: 'project-1',
      reason: 'Approved cancellation',
    });

    expect(result.status).toBe('APPROVED');
    expect(txMock.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'project-1' },
        data: { status: ProjectStatus.CANCELLED },
      })
    );
  });

  it('approveCancellation moves waiting-cancel projects to cancelled', async () => {
    txMock.project.findUnique.mockResolvedValue({
      status: ProjectStatus.WAITING_CANCEL,
    });
    txMock.project.update.mockResolvedValue({
      id: 'project-1',
      status: ProjectStatus.CANCELLED,
    });
    txMock.projectCancellation.findFirst.mockResolvedValue({
      id: 'cancellation-1',
      project_id: 'project-1',
      reason: 'Need cancellation',
      status: 'PENDING',
      requested_at: new Date('2026-06-01T00:00:00.000Z'),
      decision_by: null,
      decision_at: null,
    });
    txMock.projectCancellation.update.mockResolvedValue({
      id: 'cancellation-1',
      project_id: 'project-1',
      reason: 'Need cancellation',
      status: 'APPROVED',
      decision_by: headUser.id,
      decision_at: new Date('2026-06-01T00:00:00.000Z'),
    });

    const result = await approveCancellation(headUser, 'project-1');

    expect(result.status).toBe(ProjectStatus.CANCELLED);
    expect(txMock.projectCancellation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cancellation-1' },
        data: {
          status: 'APPROVED',
          decision_by: headUser.id,
          decision_at: new Date('2026-06-01T00:00:00.000Z'),
        },
      })
    );
  });

  it('rejectCancellation restores the previous status from project history', async () => {
    txMock.project.findUnique.mockResolvedValue({
      status: ProjectStatus.WAITING_CANCEL,
    });
    txMock.projectHistory.findFirst.mockResolvedValue({
      old_value: { status: ProjectStatus.IN_PROGRESS },
    });
    txMock.projectCancellation.findFirst.mockResolvedValue({
      id: 'cancellation-1',
      project_id: 'project-1',
      reason: 'Need cancellation',
      status: 'PENDING',
      requested_at: new Date('2026-06-01T00:00:00.000Z'),
      decision_by: null,
      decision_at: null,
    });
    txMock.project.update.mockResolvedValue({
      id: 'project-1',
      status: ProjectStatus.IN_PROGRESS,
    });
    txMock.projectCancellation.update.mockResolvedValue({
      id: 'cancellation-1',
      project_id: 'project-1',
      reason: 'Need cancellation',
      status: 'REJECTED',
      decision_by: headUser.id,
      decision_at: new Date('2026-06-01T00:00:00.000Z'),
    });

    const result = await rejectCancellation(headUser, 'project-1');

    expect(result.status).toBe(ProjectStatus.IN_PROGRESS);
    expect(txMock.projectCancellation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cancellation-1' },
        data: {
          status: 'REJECTED',
          decision_by: headUser.id,
          decision_at: new Date('2026-06-01T00:00:00.000Z'),
        },
      })
    );
  });

  it('completeProcurementPhase moves procurement projects into contract workflow as unassigned', async () => {
    txMock.project.findUnique.mockResolvedValue({
      status: ProjectStatus.IN_PROGRESS,
      current_workflow_type: UnitResponsibleType.LT100K,
      procurement_progress: {},
      responsible_unit_id: 'unit-proc',
      procurement_completed_at: null,
      contract_started_at: null,
      assignee_procurement: [],
    });
    txMock.project.update.mockResolvedValue({
      id: 'project-1',
      status: ProjectStatus.UNASSIGNED,
      current_workflow_type: UnitResponsibleType.CONTRACT,
      responsible_unit_id: CONTRACT_UNIT_ID,
      assignee_contract: [],
    });

    const result = await completeProcurementPhase(headUser, {
      id: 'project-1',
      continue_unit_proc: false,
    } as any);

    expect(result).toMatchObject({
      status: ProjectStatus.UNASSIGNED,
      current_workflow_type: UnitResponsibleType.CONTRACT,
      responsible_unit_id: CONTRACT_UNIT_ID,
    });
    expect(txMock.projectHistory.create).toHaveBeenCalled();
    expect(txMock.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          procurement_completed_at: expect.any(Date),
        }),
      })
    );
    const updateCall = txMock.project.update.mock.calls[0][0];
    expect(updateCall.data.contract_started_at).toBeUndefined();
  });

  it('completeProcurementPhase sets contract_started_at when assignee_contract is attached', async () => {
    txMock.project.findUnique
      .mockResolvedValueOnce({
        status: ProjectStatus.IN_PROGRESS,
        current_workflow_type: UnitResponsibleType.LT100K,
        procurement_progress: {},
        responsible_unit_id: 'unit-proc',
        procurement_completed_at: null,
        contract_started_at: null,
        assignee_procurement: [{ id: 'staff-1' }],
      })
      .mockResolvedValueOnce({
        id: 'project-1',
        title: 'Project 1',
        receive_no: '2569/00001',
      })
      .mockResolvedValueOnce({
        id: 'project-1',
        title: 'Project 1',
        responsible_unit_id: 'unit-proc',
        created_by: 'user-1',
        assignee_procurement: [
          { id: 'staff-1', full_name: 'Staff One', email: null },
        ],
        assignee_contract: [
          { id: 'staff-1', full_name: 'Staff One', email: null },
        ],
        creator: { id: 'user-1', full_name: 'User One', email: null },
      });
    txMock.user.findMany.mockImplementation(async (args: any) => {
      const ids = args?.where?.id?.in ?? [];
      return ids.map((id: string) => ({ id }));
    });
    txMock.notification.findFirst.mockResolvedValue(null);
    txMock.notification.create.mockResolvedValue({
      id: 'notification-1',
      user_id: 'staff-1',
      project_id: 'project-1',
      category: 'ASSIGNMENTS',
      priority: 'HIGH',
      title: 'assigned',
      body: 'assigned',
      target_path: '/app/projects/project-1',
      action_label: 'open',
      requires_action: true,
      is_read: false,
      read_at: null,
      created_at: new Date('2026-06-01T00:00:00.000Z'),
      metadata: { notification_kind: 'ASSIGNED_PROJECTS' },
    });
    txMock.notification.groupBy.mockResolvedValue([
      { user_id: 'staff-1', _count: { _all: 1 } },
    ]);
    txMock.project.update.mockResolvedValue({
      id: 'project-1',
      status: ProjectStatus.IN_PROGRESS,
      current_workflow_type: UnitResponsibleType.CONTRACT,
      responsible_unit_id: 'unit-proc',
      assignee_contract: [{ id: 'staff-1' }],
    });

    const result = await completeProcurementPhase(headUser, {
      id: 'project-1',
      continue_unit_proc: true,
    } as any);

    expect(txMock.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          procurement_completed_at: expect.any(Date),
          contract_started_at: expect.any(Date),
        }),
      })
    );
    expect(txMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: 'staff-1',
          category: 'ASSIGNMENTS',
          dedupe_key: 'assignment:project-1:staff-1',
        }),
      })
    );
    expect(result.assignee_contract).toEqual([{ id: 'staff-1' }]);
  });

  it('completeProcurementPhase notifies directly assigned contract staff', async () => {
    txMock.project.findUnique
      .mockResolvedValueOnce({
        status: ProjectStatus.IN_PROGRESS,
        current_workflow_type: UnitResponsibleType.LT100K,
        procurement_progress: {},
        responsible_unit_id: 'unit-proc',
        procurement_completed_at: null,
        contract_started_at: null,
        assignee_procurement: [],
      })
      .mockResolvedValueOnce({
        id: 'project-1',
        title: 'Project 1',
        receive_no: '2569/00001',
      })
      .mockResolvedValueOnce({
        id: 'project-1',
        title: 'Project 1',
        responsible_unit_id: CONTRACT_UNIT_ID,
        created_by: 'user-1',
        assignee_procurement: [],
        assignee_contract: [
          { id: 'contract-1', full_name: 'Contract One', email: null },
        ],
        creator: { id: 'user-1', full_name: 'User One', email: null },
      });
    txMock.user.findMany.mockImplementation(async (args: any) => {
      const ids = args?.where?.id?.in ?? [];
      return ids.map((id: string) => ({ id }));
    });
    txMock.notification.findFirst.mockResolvedValue(null);
    txMock.notification.create.mockResolvedValue({
      id: 'notification-1',
      user_id: 'contract-1',
      project_id: 'project-1',
      category: 'ASSIGNMENTS',
      priority: 'HIGH',
      title: 'assigned',
      body: 'assigned',
      target_path: '/app/projects/project-1',
      action_label: 'open',
      requires_action: true,
      is_read: false,
      read_at: null,
      created_at: new Date('2026-06-01T00:00:00.000Z'),
      metadata: { notification_kind: 'ASSIGNED_PROJECTS' },
    });
    txMock.notification.groupBy.mockResolvedValue([
      { user_id: 'contract-1', _count: { _all: 1 } },
    ]);
    txMock.project.update.mockResolvedValue({
      id: 'project-1',
      status: ProjectStatus.WAITING_ACCEPT,
      current_workflow_type: UnitResponsibleType.CONTRACT,
      responsible_unit_id: CONTRACT_UNIT_ID,
      assignee_contract: [{ id: 'contract-1' }],
    });

    await completeProcurementPhase(headUser, {
      id: 'project-1',
      assignee_contract: 'contract-1',
      continue_unit_proc: false,
    } as any);

    expect(txMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: 'contract-1',
          category: 'ASSIGNMENTS',
          dedupe_key: 'assignment:project-1:contract-1',
        }),
      })
    );
  });

  it('closeProject closes contract projects that are in WAITING_CLOSE status', async () => {
    txMock.project.findUnique.mockResolvedValue({
      status: ProjectStatus.WAITING_CLOSE,
      current_workflow_type: UnitResponsibleType.CONTRACT,
      contract_progress: {},
    });
    txMock.project.update.mockResolvedValue({
      id: 'project-1',
      status: ProjectStatus.CLOSED,
    });

    const result = await closeProject(headUser, 'project-1');

    expect(result.status).toBe(ProjectStatus.CLOSED);
  });

  it('closeProject throws BadRequestError if project is in IN_PROGRESS status', async () => {
    txMock.project.findUnique.mockResolvedValue({
      status: ProjectStatus.IN_PROGRESS,
      current_workflow_type: UnitResponsibleType.CONTRACT,
      contract_progress: {},
    });

    await expect(closeProject(headUser, 'project-1')).rejects.toThrow(
      'Project cannot be closed unless it is in WAITING_CLOSE status'
    );
  });
});
