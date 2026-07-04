import { ProjectStatus, UnitResponsibleType, UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTRACT_UNIT_ID, OPS_DEPT_ID } from '../../lib/constant';
import { txMock } from '../../test/prisma-mock';
import {
  approveCancellation,
  cancelProject,
  closeProject,
  completeProcurementPhase,
  rejectCancellation,
  requestEditProject,
} from '../project-lifecycle.service';

const staffUser = {
  id: 'staff-1',
  full_name: 'Staff One',
  is_delegated: false,
  delegated_by: [],
  roles: [
    { role: UserRole.GENERAL_STAFF, dept_id: OPS_DEPT_ID, unit_id: 'unit-1' },
  ],
} as any;

const headUser = {
  id: 'head-1',
  full_name: 'Head User',
  is_delegated: false,
  delegated_by: [],
  roles: [
    { role: UserRole.HEAD_OF_DEPARTMENT, dept_id: OPS_DEPT_ID, unit_id: null },
  ],
} as any;

describe('project-lifecycle.service', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
  });

  it('cancelProject creates a waiting-cancel request for non-head users', async () => {
    txMock.project.findUnique.mockResolvedValue({
      status: ProjectStatus.IN_PROGRESS,
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
  });

  it('closeProject closes contract projects that are in progress', async () => {
    txMock.project.findUnique.mockResolvedValue({
      status: ProjectStatus.IN_PROGRESS,
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

  it('requestEditProject reopens closed projects with a reason', async () => {
    txMock.project.findUnique.mockResolvedValue({
      status: ProjectStatus.CLOSED,
    });
    txMock.project.update.mockResolvedValue({
      id: 'project-1',
      status: ProjectStatus.REQUEST_EDIT,
      request_edit_reason: 'Fix vendor details',
    });

    const result = await requestEditProject(headUser, {
      id: 'project-1',
      reason: 'Fix vendor details',
    });

    expect(result).toMatchObject({
      status: ProjectStatus.REQUEST_EDIT,
      request_edit_reason: 'Fix vendor details',
    });
  });
});
