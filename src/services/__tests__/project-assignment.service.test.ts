import { ProjectStatus, UnitResponsibleType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError } from '../../lib/errors';
import { syncProjectPhases } from '../../lib/phase-status';
import { txMock } from '../../test/prisma-mock';
import {
  acceptProjects,
  addAssignee,
  assignProjectsToUser,
  changeAssignee,
  claimProject,
  returnProject,
} from '../project-assignment.service';

vi.mock('../../lib/phase-status', () => ({
  syncProjectPhases: vi.fn().mockResolvedValue({ id: 'project-1' }),
}));

const mockedSyncProjectPhases = vi.mocked(syncProjectPhases);

const user = {
  id: 'staff-1',
  full_name: 'Staff One',
  roles: [],
} as any;

describe('project-assignment.service', () => {
  beforeEach(() => {
    mockedSyncProjectPhases.mockReset();
    mockedSyncProjectPhases.mockResolvedValue({ id: 'project-1' } as any);
  });

  it('assignProjectsToUser assigns unassigned projects and records history', async () => {
    txMock.project.findMany.mockResolvedValue([
      {
        id: 'project-1',
        status: ProjectStatus.UNASSIGNED,
        current_workflow_type: UnitResponsibleType.LT100K,
        assignee_procurement: [],
        assignee_contract: [],
      },
    ]);
    txMock.user.findMany.mockResolvedValue([
      { id: 'staff-2', full_name: 'Staff Two' },
    ]);
    txMock.project.update.mockResolvedValue({
      id: 'project-1',
      status: ProjectStatus.WAITING_ACCEPT,
      assignee_procurement: [{ id: 'staff-2' }],
    });

    const result = await assignProjectsToUser(user, [
      { id: 'project-1', userId: 'staff-2' },
    ] as any);

    expect(result).toHaveLength(1);
    expect(txMock.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'project-1',
          status: ProjectStatus.UNASSIGNED,
          assignee_procurement: { none: {} },
        },
        data: {
          status: ProjectStatus.WAITING_ACCEPT,
          assignee_procurement: { connect: { id: 'staff-2' } },
        },
      })
    );
    expect(txMock.projectHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          new_value: {
            status: ProjectStatus.WAITING_ACCEPT,
            assignee_procurement: ['Staff Two'],
          },
        }),
      })
    );
  });

  it('changeAssignee replaces the waiting-accept assignee', async () => {
    txMock.project.findUnique.mockResolvedValue({
      status: ProjectStatus.WAITING_ACCEPT,
      current_workflow_type: UnitResponsibleType.LT100K,
      assignee_procurement: [{ id: 'old-staff', full_name: 'Old Staff' }],
      assignee_contract: [],
    });
    txMock.user.findUnique.mockResolvedValue({
      id: 'new-staff',
      full_name: 'New Staff',
    });
    txMock.project.update.mockResolvedValue({
      id: 'project-1',
      status: ProjectStatus.WAITING_ACCEPT,
      assignee_procurement: [{ id: 'new-staff' }],
    });

    const result = await changeAssignee(user, {
      id: 'project-1',
      userId: 'new-staff',
    } as any);

    expect(result.status).toBe(ProjectStatus.WAITING_ACCEPT);
    expect(txMock.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          assignee_procurement: {
            disconnect: { id: 'old-staff' },
            connect: { id: 'new-staff' },
          },
        },
      })
    );
  });

  it('claimProject self-assigns an unassigned project and syncs phases', async () => {
    txMock.project.findUnique.mockResolvedValue({
      status: ProjectStatus.UNASSIGNED,
      current_workflow_type: UnitResponsibleType.LT100K,
    });
    txMock.project.update.mockResolvedValue({
      id: 'project-1',
      status: ProjectStatus.IN_PROGRESS,
      assignee_procurement: [{ id: user.id }],
    });

    const result = await claimProject(user, 'project-1');

    expect(result.status).toBe(ProjectStatus.IN_PROGRESS);
    expect(mockedSyncProjectPhases).toHaveBeenCalledWith(
      txMock,
      UnitResponsibleType.LT100K,
      'project-1'
    );
  });

  it('acceptProjects moves waiting-accept projects to in progress and syncs each phase', async () => {
    txMock.project.findMany.mockResolvedValue([
      {
        id: 'project-1',
        status: ProjectStatus.WAITING_ACCEPT,
        current_workflow_type: UnitResponsibleType.LT100K,
        assignee_procurement: [{ id: user.id }],
        assignee_contract: [],
      },
    ]);
    txMock.project.update.mockResolvedValue({
      id: 'project-1',
      status: ProjectStatus.IN_PROGRESS,
    });

    const result = await acceptProjects(user, { id: ['project-1'] } as any);

    expect(result).toEqual([
      { id: 'project-1', status: ProjectStatus.IN_PROGRESS },
    ]);
    expect(mockedSyncProjectPhases).toHaveBeenCalledWith(
      txMock,
      UnitResponsibleType.LT100K,
      'project-1'
    );
  });

  it('addAssignee adds a second assignee to an in-progress project', async () => {
    txMock.project.findUnique.mockResolvedValue({
      status: ProjectStatus.IN_PROGRESS,
      current_workflow_type: UnitResponsibleType.LT100K,
      assignee_procurement: [{ id: 'staff-1', full_name: 'Staff One' }],
      assignee_contract: [],
      _count: { assignee_procurement: 1, assignee_contract: 0 },
    });
    txMock.user.findUnique.mockResolvedValue({
      id: 'staff-2',
      full_name: 'Staff Two',
    });
    txMock.project.update.mockResolvedValue({
      id: 'project-1',
      status: ProjectStatus.IN_PROGRESS,
      assignee_procurement: [
        { id: 'staff-1', full_name: 'Staff One' },
        { id: 'staff-2', full_name: 'Staff Two' },
      ],
    });

    const result = await addAssignee(user, {
      id: 'project-1',
      userId: 'staff-2',
    } as any);

    expect(result.assignee_procurement).toHaveLength(2);
    expect(txMock.projectHistory.create).toHaveBeenCalled();
  });

  it('rejects addAssignee when the project is not in progress', async () => {
    txMock.project.findUnique.mockResolvedValue({
      status: ProjectStatus.UNASSIGNED,
      current_workflow_type: UnitResponsibleType.LT100K,
      assignee_procurement: [],
      assignee_contract: [],
      _count: { assignee_procurement: 0, assignee_contract: 0 },
    });
    txMock.user.findUnique.mockResolvedValue({
      id: 'staff-2',
      full_name: 'Staff Two',
    });
    txMock.project.update.mockResolvedValue({
      id: 'project-1',
      status: ProjectStatus.UNASSIGNED,
      assignee_procurement: [{ id: 'staff-2', full_name: 'Staff Two' }],
    });

    await expect(
      addAssignee(user, { id: 'project-1', userId: 'staff-2' } as any)
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('returnProject removes the assignee and syncs phases when there are no submissions', async () => {
    txMock.project.findUnique.mockResolvedValue({
      status: ProjectStatus.IN_PROGRESS,
      current_workflow_type: UnitResponsibleType.LT100K,
      _count: { submissions: 0 },
    });
    txMock.project.update.mockResolvedValue({
      id: 'project-1',
      status: ProjectStatus.UNASSIGNED,
    });

    const result = await returnProject(user, 'project-1');

    expect(result.status).toBe(ProjectStatus.UNASSIGNED);
    expect(mockedSyncProjectPhases).toHaveBeenCalledWith(
      txMock,
      UnitResponsibleType.LT100K,
      'project-1'
    );
  });
});
