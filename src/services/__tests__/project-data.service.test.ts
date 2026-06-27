import { AppError, BadRequestError, NotFoundError } from '../../lib/errors';
import {
  ProcurementType,
  ProjectStatus,
  UnitResponsibleType,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { txMock } from '../../test/prisma-mock';
import {
  cancelContractNumber,
  createProject,
  generateContractNumber,
  importProjects,
  updateProjectData,
} from '../project-data.service';

const user = { id: 'user-1', full_name: 'Procurement Staff', roles: [] } as any;

const createProjectDto = (overrides = {}) =>
  ({
    title: 'New procurement',
    description: 'Office supplies',
    budget: 1000,
    procurement_type: ProcurementType.LT100K,
    requesting_dept_id: 'dept-1',
    requesting_unit_id: 'unit-request',
    pr_no: 'PR-1',
    less_no: 'LESS-1',
    budget_year: 2569,
    budget_plan_id: ['budget-1'],
    ...overrides,
  }) as any;

const mockResponsibleUnit = () => {
  txMock.unit.findMany.mockResolvedValue([
    { id: 'unit-proc-1', type: [UnitResponsibleType.LT100K] },
  ]);
};

describe('project-data.service', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
  });

  it('createProject creates a project with an advisory lock, receive number, and responsible unit', async () => {
    txMock.project.findFirst.mockResolvedValue(null);
    txMock.budgetPlan.findMany.mockResolvedValue([{ id: 'budget-1' }]);
    txMock.project.count.mockResolvedValue(4);
    mockResponsibleUnit();
    txMock.project.create.mockResolvedValue({
      id: 'project-1',
      status: ProjectStatus.UNASSIGNED,
      receive_no: '2569/00005',
      responsible_unit_id: 'unit-proc-1',
    });

    const result = await createProject(user, createProjectDto());

    expect(result.receive_no).toBe('2569/00005');
    expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
    expect(txMock.$executeRaw.mock.calls[0][0][0]).toContain(
      'project_creation_lock'
    );
    expect(txMock.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          receive_no: '2569/00005',
          responsible_unit_id: 'unit-proc-1',
          status: ProjectStatus.UNASSIGNED,
          created_by: user.id,
        }),
      })
    );
    expect(txMock.budgetPlan.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['budget-1'] } },
      data: { project_id: 'project-1' },
    });
  });

  it('importProjects assigns sequential receive numbers per fiscal year under one advisory lock', async () => {
    txMock.project.findFirst.mockResolvedValue(null);
    txMock.project.count.mockResolvedValue(10);
    mockResponsibleUnit();
    txMock.project.createManyAndReturn.mockResolvedValue([
      { id: 'project-1', receive_no: '2569/00011' },
      { id: 'project-2', receive_no: '2569/00012' },
    ]);

    const result = await importProjects(user, [
      createProjectDto({ title: 'A', pr_no: 'PR-A', less_no: 'LESS-A' }),
      createProjectDto({ title: 'B', pr_no: 'PR-B', less_no: 'LESS-B' }),
    ]);

    expect(result.total).toBe(2);
    expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
    expect(txMock.project.createManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ receive_no: '2569/00011' }),
          expect.objectContaining({ receive_no: '2569/00012' }),
        ],
      })
    );
  });

  it('updateProjectData updates project fields and records history', async () => {
    txMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      title: 'Old title',
      pr_no: 'OLD-PR',
      less_no: 'OLD-LESS',
    });
    txMock.project.findFirst.mockResolvedValue(null);
    txMock.project.update.mockResolvedValue({
      id: 'project-1',
      title: 'New title',
    });

    const result = await updateProjectData(user, {
      id: 'project-1',
      updateData: { title: 'New title', budget_plan_id: ['budget-2'] },
    } as any);

    expect(result.title).toBe('New title');
    expect(txMock.project.update).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      data: { title: 'New title' },
    });
    expect(txMock.projectHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          old_value: { title: 'Old title' },
          new_value: { title: 'New title' },
          changed_by: user.id,
        }),
      })
    );
  });

  it('rejects duplicate PR numbers inside one import request', async () => {
    await expect(
      importProjects(user, [
        createProjectDto({ pr_no: 'PR-DUP', less_no: 'L1' }),
        createProjectDto({ pr_no: 'PR-DUP', less_no: 'L2' }),
      ])
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects an existing PR or LESS conflict from the database', async () => {
    txMock.project.findFirst.mockResolvedValue({
      id: 'existing-project',
      pr_no: 'PR-1',
      less_no: null,
    });

    await expect(
      createProject(user, createProjectDto())
    ).rejects.toBeInstanceOf(AppError);
  });

  it('rejects missing budget plans before creating the project', async () => {
    txMock.project.findFirst.mockResolvedValue(null);
    txMock.budgetPlan.findMany.mockResolvedValue([]);

    await expect(
      createProject(user, createProjectDto())
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(txMock.project.create).not.toHaveBeenCalled();
  });

  it('rejects unknown procurement unit mapping', async () => {
    txMock.project.findFirst.mockResolvedValue(null);
    txMock.budgetPlan.findMany.mockResolvedValue([{ id: 'budget-1' }]);
    txMock.project.count.mockResolvedValue(0);
    txMock.unit.findMany.mockResolvedValue([]);

    await expect(
      createProject(user, createProjectDto())
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects empty update payloads before opening a transaction', async () => {
    await expect(
      updateProjectData(user, { id: 'project-1', updateData: {} } as any)
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(txMock.project.findUnique).not.toHaveBeenCalled();
  });

  it('generateContractNumber creates the next contract number under an advisory lock', async () => {
    txMock.projectContractNumber.count.mockResolvedValue(2);
    txMock.projectContractNumber.create.mockResolvedValue({
      id: 'contract-1',
      contract_no: '3/2569',
      type: 'PO',
      is_active: true,
      cancellation_reason: null,
    });

    const result = await generateContractNumber(user, 'PO', 2569);

    expect(result).toEqual({ id: 'contract-1', contract_no: '3/2569' });
    expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
    expect(txMock.projectContractNumber.count).toHaveBeenCalledWith({
      where: { type: 'PO', contract_no: { endsWith: '/2569' } },
    });
    expect(txMock.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'CONTRACT_NUMBER',
          event_type: 'CONTRACT_NUMBER_CREATED',
          target_type: 'CONTRACT_NUMBER',
          target_id: 'contract-1',
          actor_id: user.id,
        }),
      })
    );
  });

  it('uses a stable contract-number advisory lock key for the type and fiscal year', async () => {
    txMock.projectContractNumber.count.mockResolvedValue(0);
    txMock.projectContractNumber.create.mockResolvedValue({
      id: 'contract-1',
      contract_no: '1/2569',
      type: 'PO',
      is_active: true,
      cancellation_reason: null,
    });

    await generateContractNumber(user, 'PO', 2569);

    expect(txMock.$executeRaw.mock.calls[0][1]).toBe('2569:PO');
  });

  it('cancelContractNumber deactivates the contract and clears the linked project contract id', async () => {
    txMock.projectContractNumber.findFirst.mockResolvedValue({
      id: 'contract-1',
      contract_no: '3/2569',
      project: { id: 'project-1' },
    });
    txMock.projectContractNumber.update.mockResolvedValue({
      id: 'contract-1',
      contract_no: '3/2569',
      type: 'PO',
      is_active: false,
      cancellation_reason: 'Duplicate',
    });

    const result = await cancelContractNumber(user, 'contract-1', 'Duplicate');

    expect(result.is_active).toBe(false);
    expect(txMock.project.update).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      data: { contract_no_id: null },
    });
    expect(txMock.projectHistory.create).toHaveBeenCalled();
    expect(txMock.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'CONTRACT_NUMBER',
          event_type: 'CONTRACT_NUMBER_CANCELLED',
          target_type: 'CONTRACT_NUMBER',
          target_id: 'contract-1',
          actor_id: user.id,
          comment: 'Duplicate',
        }),
      })
    );
  });
});
