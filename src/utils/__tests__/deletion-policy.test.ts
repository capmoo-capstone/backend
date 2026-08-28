import { ProjectStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  assertProjectCanBeDeleted,
  assertUnitCanBeDeleted,
} from '../deletion-policy';

describe('deletion policy', () => {
  it('blocks deletion of a project after it enters a workflow state', async () => {
    const tx = {
      project: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ status: ProjectStatus.IN_PROGRESS }),
      },
    } as any;

    await expect(assertProjectCanBeDeleted(tx, 'project-1')).rejects.toThrow(
      'Only unassigned projects can be deleted'
    );
  });

  it('blocks deletion of a unit that would cascade budget plans', async () => {
    const tx = {
      budgetPlan: { count: vi.fn().mockResolvedValue(1) },
      userOrganizationRole: { count: vi.fn().mockResolvedValue(0) },
      project: { count: vi.fn().mockResolvedValue(0) },
    } as any;

    await expect(assertUnitCanBeDeleted(tx, 'unit-1')).rejects.toThrow(
      'Unit cannot be deleted while it is still in use'
    );
  });
});
