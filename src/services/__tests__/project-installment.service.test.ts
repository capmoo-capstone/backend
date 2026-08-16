import {
  ProjectInstallment,
  ProjectInstallmentStatus,
  ProjectStatus,
  SubmissionStatus,
  UnitResponsibleType,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WORKFLOW_STEP_ORDERS } from '../../lib/constant';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { prismaMock, txMock } from '../../test/prisma-mock';
import { AuthPayload } from '../../types/auth.type';
import {
  createInstallment as createFinanceExportRequest,
  exportInstallments as exportFinanceData,
  getInstallments,
  requestEditInstallment,
} from '../project-installment.service';

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  full_name: 'Test User',
  roles: [{ role: 'SUPER_ADMIN' }],
} as unknown as AuthPayload;

const completedContractInstallment = (installmentNo: number) =>
  WORKFLOW_STEP_ORDERS[UnitResponsibleType.CONTRACT].map((step_order) => ({
    step_order,
    status: SubmissionStatus.COMPLETED,
    installment_no: installmentNo,
  }));

describe('project-finance.service', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
  });

  describe('createFinanceExportRequest', () => {
    const dto = {
      id: 'project-uuid-1',
      installment_no: 2,
    };

    beforeEach(() => {
      txMock.projectSubmission.findMany.mockResolvedValue(
        completedContractInstallment(dto.installment_no)
      );
    });

    it('should throw NotFoundError if project is not found', async () => {
      txMock.project.findUnique.mockResolvedValue(null);

      await expect(createFinanceExportRequest(mockUser, dto)).rejects.toThrow(
        NotFoundError
      );

      expect(txMock.project.findUnique).toHaveBeenCalledWith({
        where: { id: dto.id },
        select: {
          installment_rounds: true,
          current_workflow_type: true,
          contract_completed_at: true,
        },
      });
    });

    it('should throw BadRequestError if project workflow is not CONTRACT', async () => {
      txMock.project.findUnique.mockResolvedValue({
        installment_rounds: 3,
        current_workflow_type: UnitResponsibleType.LT100K, // not CONTRACT
      });

      await expect(createFinanceExportRequest(mockUser, dto)).rejects.toThrow(
        new BadRequestError(
          'Installment Finance Export Request is only allowed for CONTRACT workflow'
        )
      );
    });

    it('should throw BadRequestError if installment_no is less than 1', async () => {
      txMock.project.findUnique.mockResolvedValue({
        installment_rounds: 3,
        current_workflow_type: UnitResponsibleType.CONTRACT,
        contract_completed_at: null,
      });

      await expect(
        createFinanceExportRequest(mockUser, { ...dto, installment_no: 0 })
      ).rejects.toThrow(
        new BadRequestError('Installment number must be between 1 and 3')
      );
    });

    it('should throw BadRequestError if installment_no is greater than installment_rounds', async () => {
      txMock.project.findUnique.mockResolvedValue({
        installment_rounds: 3,
        current_workflow_type: UnitResponsibleType.CONTRACT,
      });

      await expect(
        createFinanceExportRequest(mockUser, { ...dto, installment_no: 4 })
      ).rejects.toThrow(
        new BadRequestError('Installment number must be between 1 and 3')
      );
    });

    it('should throw BadRequestError when a contract step is not completed', async () => {
      txMock.project.findUnique.mockResolvedValue({
        installment_rounds: 3,
        current_workflow_type: UnitResponsibleType.CONTRACT,
      });
      txMock.projectSubmission.findMany.mockResolvedValue([
        ...completedContractInstallment(dto.installment_no).slice(0, 4),
        {
          step_order: 5,
          status: SubmissionStatus.WAITING_SIGNATURE,
          installment_no: dto.installment_no,
        },
      ]);

      await expect(createFinanceExportRequest(mockUser, dto)).rejects.toThrow(
        new BadRequestError(
          'All contract steps for this installment must be completed before requesting finance export'
        )
      );

      expect(txMock.projectInstallment.upsert).not.toHaveBeenCalled();
    });

    it('should upsert projectInstallment when all validations pass', async () => {
      txMock.userOrganizationRole.findMany.mockResolvedValue([
        {
          user: { id: 'finance-1', full_name: 'Finance One', email: null },
        },
      ]);
      txMock.userDelegation.findMany.mockResolvedValue([]);
      txMock.user.findMany.mockResolvedValue([{ id: 'finance-1' }]);
      txMock.notification.findFirst.mockResolvedValue(null);
      txMock.project.findUnique.mockImplementation(async (args: any) => {
        if (args?.select?.title) {
          return {
            id: dto.id,
            title: 'Project 1',
            responsible_unit_id: 'unit-1',
            created_by: 'creator-1',
            assignee_procurement: [],
            assignee_contract: [
              { id: 'contract-1', full_name: 'Contract One', email: null },
            ],
            creator: { id: 'creator-1', full_name: 'Creator One', email: null },
          };
        }

        return {
          installment_rounds: 3,
          current_workflow_type: UnitResponsibleType.CONTRACT,
          contract_completed_at: null,
        };
      });

      const mockExportResult = {
        id: 'export-uuid',
        project_id: dto.id,
        installment_no: dto.installment_no,
        status: ProjectInstallmentStatus.WAITING_EXPORT,
        created_by: mockUser.id,
        created_at: new Date('2026-06-01T00:00:00.000Z'),
      } as ProjectInstallment;

      txMock.projectInstallment.upsert.mockResolvedValue(mockExportResult);
      txMock.projectInstallment.count.mockResolvedValue(2);
      txMock.notification.create.mockResolvedValue({
        id: 'notification-finance-1',
        user_id: 'finance-1',
        project_id: dto.id,
        category: 'FINANCE_HANDOFFS',
        priority: 'MEDIUM',
        title: 'มีงานพร้อมส่งออกการเงิน',
        body: `งวดที่ ${dto.installment_no} ของโครงการ "Project 1" พร้อมส่งออกการเงิน`,
        target_path: `/app/projects/${dto.id}`,
        action_label: 'เปิดโครงการ',
        requires_action: false,
        is_read: false,
        read_at: null,
        created_at: new Date('2026-06-01T00:00:00.000Z'),
        metadata: { notification_kind: 'FINANCE_SUBMIT' },
      });
      txMock.notification.groupBy.mockResolvedValue([
        { user_id: 'finance-1', _count: { _all: 1 } },
      ]);

      const result = await createFinanceExportRequest(mockUser, dto);

      expect(result).toEqual(mockExportResult);
      expect(txMock.projectInstallment.upsert).toHaveBeenCalledWith({
        where: {
          project_id_installment_no: {
            project_id: dto.id,
            installment_no: dto.installment_no,
          },
        },
        create: {
          project_id: dto.id,
          installment_no: dto.installment_no,
          status: ProjectInstallmentStatus.WAITING_EXPORT,
          created_by: mockUser.id,
        },
        update: {
          status: ProjectInstallmentStatus.WAITING_EXPORT,
        },
      });
      expect(txMock.projectSubmission.findMany).toHaveBeenCalledWith({
        where: {
          project_id: dto.id,
          workflow_type: UnitResponsibleType.CONTRACT,
          installment_no: dto.installment_no,
        },
        orderBy: [{ step_order: 'asc' }, { submission_round: 'desc' }],
        select: { step_order: true, status: true },
      });
      expect(txMock.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            user_id: 'finance-1',
            category: 'FINANCE_HANDOFFS',
            metadata: expect.objectContaining({
              notification_kind: 'FINANCE_SUBMIT',
            }),
          }),
        })
      );
    });

    it('records contract completion when the final installment export is created', async () => {
      const completedAt = new Date('2026-06-02T00:00:00.000Z');
      txMock.project.findUnique.mockResolvedValue({
        installment_rounds: 2,
        current_workflow_type: UnitResponsibleType.CONTRACT,
        contract_completed_at: null,
      });
      txMock.projectInstallment.upsert.mockResolvedValue({
        id: 'export-final',
        project_id: dto.id,
        installment_no: dto.installment_no,
        status: ProjectInstallmentStatus.WAITING_EXPORT,
        created_by: mockUser.id,
        created_at: completedAt,
      });
      txMock.projectInstallment.count.mockResolvedValue(2);

      await createFinanceExportRequest(mockUser, dto);

      expect(txMock.project.update).toHaveBeenCalledWith({
        where: { id: dto.id },
        data: { contract_completed_at: completedAt },
      });
    });

    it('does not overwrite an existing contract completion timestamp', async () => {
      const existingCompletion = new Date('2026-06-01T00:00:00.000Z');
      txMock.project.findUnique.mockResolvedValue({
        installment_rounds: 2,
        current_workflow_type: UnitResponsibleType.CONTRACT,
        contract_completed_at: existingCompletion,
      });
      txMock.projectInstallment.upsert.mockResolvedValue({
        id: 'export-final',
        project_id: dto.id,
        installment_no: dto.installment_no,
        status: ProjectInstallmentStatus.WAITING_EXPORT,
        created_by: mockUser.id,
        created_at: new Date('2026-06-02T00:00:00.000Z'),
      });
      txMock.projectInstallment.count.mockResolvedValue(2);

      await createFinanceExportRequest(mockUser, dto);

      expect(txMock.project.update).not.toHaveBeenCalled();
    });
  });

  describe('getInstallments', () => {
    it('should return a paginated response with export requests and total count', async () => {
      const mockExports = [
        {
          id: '1',
          project_id: 'p1',
          installment_no: 1,
          status: ProjectInstallmentStatus.WAITING_EXPORT,
        },
        {
          id: '2',
          project_id: 'p2',
          installment_no: 2,
          status: ProjectInstallmentStatus.EXPORTED,
        },
      ] as ProjectInstallment[];

      prismaMock.projectInstallment.findMany.mockResolvedValue(mockExports);
      prismaMock.projectInstallment.count.mockResolvedValue(10);

      const page = 2;
      const limit = 2;
      const result = await getInstallments(mockUser, page, limit);

      expect(result).toEqual({
        total: 10,
        page,
        pageSize: limit,
        totalPages: 5,
        data: mockExports,
      });

      expect(prismaMock.projectInstallment.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { created_at: 'desc' },
        skip: 2,
        take: 2,
        select: expect.any(Object),
      });
      expect(prismaMock.projectInstallment.count).toHaveBeenCalledWith({
        where: {},
      });
    });

    it('should apply filters for title and status', async () => {
      prismaMock.projectInstallment.findMany.mockResolvedValue([]);
      prismaMock.projectInstallment.count.mockResolvedValue(0);

      await getInstallments(mockUser, 1, 10, {
        title: 'Chairs',
        status: [ProjectInstallmentStatus.WAITING_EXPORT],
      });

      const expectedWhere = {
        AND: [
          {
            project: {
              title: {
                contains: 'Chairs',
                mode: 'insensitive',
              },
            },
          },
          {
            status: { in: [ProjectInstallmentStatus.WAITING_EXPORT] },
          },
        ],
      };

      expect(prismaMock.projectInstallment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expectedWhere,
        })
      );
      expect(prismaMock.projectInstallment.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
    });
  });

  describe('exportFinanceData', () => {
    const exportDto = {
      id: ['export-1', 'export-2'],
    };

    it('should throw BadRequestError if requested export requests do not match the expected count', async () => {
      txMock.projectInstallment.count.mockResolvedValue(1);

      await expect(exportFinanceData(mockUser, exportDto)).rejects.toThrow(
        new BadRequestError(
          'Some export requests are already exported or not found'
        )
      );

      expect(txMock.projectInstallment.count).toHaveBeenCalledWith({
        where: {
          id: { in: exportDto.id },
          status: {
            in: [
              ProjectInstallmentStatus.WAITING_EXPORT,
              ProjectInstallmentStatus.REQUEST_EDIT,
            ],
          },
        },
      });
    });

    it('should update requests to status EXPORTED and return list response', async () => {
      txMock.projectInstallment.count.mockResolvedValue(2);

      const mockUpdated = [
        {
          id: 'export-1',
          project_id: 'p1',
          installment_no: 1,
          status: ProjectInstallmentStatus.EXPORTED,
        },
        {
          id: 'export-2',
          project_id: 'p2',
          installment_no: 2,
          status: ProjectInstallmentStatus.EXPORTED,
        },
      ];

      txMock.projectInstallment.updateManyAndReturn.mockResolvedValue(
        mockUpdated as unknown as ProjectInstallment[]
      );

      const result = await exportFinanceData(mockUser, exportDto);

      expect(result).toEqual({
        total: 2,
        data: mockUpdated,
      });

      expect(
        txMock.projectInstallment.updateManyAndReturn
      ).toHaveBeenCalledWith({
        where: {
          id: { in: exportDto.id },
          status: {
            in: [
              ProjectInstallmentStatus.WAITING_EXPORT,
              ProjectInstallmentStatus.REQUEST_EDIT,
            ],
          },
        },
        data: {
          status: ProjectInstallmentStatus.EXPORTED,
          exported_by: mockUser.id,
          exported_at: new Date('2026-06-01T00:00:00.000Z'),
        },
      });
    });

    it('should update project status to WAITING_CLOSE when all installments are exported', async () => {
      txMock.projectInstallment.count.mockResolvedValueOnce(1);

      const mockUpdated = [
        {
          id: 'export-1',
          project_id: 'p1',
          installment_no: 1,
          status: ProjectInstallmentStatus.EXPORTED,
        },
      ];

      txMock.projectInstallment.updateManyAndReturn.mockResolvedValue(
        mockUpdated as unknown as ProjectInstallment[]
      );

      txMock.project.findUnique.mockResolvedValue({
        id: 'p1',
        status: ProjectStatus.IN_PROGRESS,
        installment_rounds: 1,
      });

      txMock.projectInstallment.count.mockResolvedValueOnce(1);

      txMock.project.update.mockResolvedValue({
        id: 'p1',
        status: ProjectStatus.WAITING_CLOSE,
      });

      const result = await exportFinanceData(mockUser, { id: ['export-1'] });

      expect(result.total).toBe(1);
      expect(txMock.project.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { status: ProjectStatus.WAITING_CLOSE },
        select: { id: true, status: true },
      });
    });
  });

  describe('requestEditInstallment', () => {
    it('should throw NotFoundError if export record is not found', async () => {
      txMock.projectInstallment.findUnique.mockResolvedValue(null);

      await expect(
        requestEditInstallment(mockUser, 'non-existent-id', 'Fix details')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BadRequestError if export status is not EXPORTED', async () => {
      txMock.projectInstallment.findUnique.mockResolvedValue({
        id: 'export-1',
        status: ProjectInstallmentStatus.WAITING_EXPORT,
      } as ProjectInstallment);

      await expect(
        requestEditInstallment(mockUser, 'export-1', 'Fix details')
      ).rejects.toThrow(
        new BadRequestError(
          'Installment export request must be in EXPORTED status to request edit'
        )
      );
    });

    it('should update status to REQUEST_EDIT, set request_edit_reason, and notify contract assignees', async () => {
      txMock.projectInstallment.findUnique.mockResolvedValue({
        id: 'export-1',
        project_id: 'project-1',
        installment_no: 2,
        status: ProjectInstallmentStatus.EXPORTED,
      } as ProjectInstallment);
      txMock.project.findUnique.mockResolvedValue({
        id: 'project-1',
        title: 'Project 1',
        responsible_unit_id: 'unit-1',
        created_by: 'creator-1',
        assignee_procurement: [],
        assignee_contract: [
          { id: 'contract-1', full_name: 'Contract One', email: null },
        ],
        creator: { id: 'creator-1', full_name: 'Creator One', email: null },
      });
      txMock.user.findMany.mockResolvedValue([{ id: 'contract-1' }]);
      txMock.notification.findFirst.mockResolvedValue(null);
      txMock.notification.create.mockResolvedValue({
        id: 'notification-1',
        user_id: 'contract-1',
        project_id: 'project-1',
        category: 'FINANCE_HANDOFFS',
        priority: 'HIGH',
        title: 'การเงินส่งคืนให้แก้ไข',
        body: 'งวดที่ 2 ของโครงการ "Project 1" ถูกส่งคืนจากการเงินเพื่อแก้ไข: Fix details',
        target_path: '/app/projects/project-1',
        action_label: 'เปิดโครงการ',
        requires_action: true,
        is_read: false,
        read_at: null,
        created_at: new Date('2026-06-01T00:00:00.000Z'),
        metadata: { notification_kind: 'FINANCE_REQUEST_EDIT' },
      });
      txMock.notification.groupBy.mockResolvedValue([
        { user_id: 'contract-1', _count: { _all: 1 } },
      ]);

      const mockUpdated = {
        id: 'export-1',
        project_id: 'project-1',
        installment_no: 2,
        status: ProjectInstallmentStatus.REQUEST_EDIT,
        request_edit_reason: 'Fix details',
      } as ProjectInstallment;

      txMock.projectInstallment.update.mockResolvedValue(mockUpdated);

      const result = await requestEditInstallment(
        mockUser,
        'export-1',
        'Fix details'
      );

      expect(result).toEqual(mockUpdated);
      expect(txMock.projectInstallment.update).toHaveBeenCalledWith({
        where: { id: 'export-1' },
        data: {
          status: ProjectInstallmentStatus.REQUEST_EDIT,
          request_edit_reason: 'Fix details',
        },
      });
      expect(txMock.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            user_id: 'contract-1',
            project_id: 'project-1',
            requires_action: true,
            title: 'การเงินส่งคืนให้แก้ไข',
            metadata: expect.objectContaining({
              notification_kind: 'FINANCE_REQUEST_EDIT',
            }),
          }),
        })
      );
    });

    it('should revert project status from WAITING_CLOSE to IN_PROGRESS when requestEditInstallment is called', async () => {
      txMock.projectInstallment.findUnique.mockResolvedValue({
        id: 'export-1',
        project_id: 'p1',
        installment_no: 1,
        status: ProjectInstallmentStatus.EXPORTED,
      } as ProjectInstallment);

      const mockUpdated = {
        id: 'export-1',
        project_id: 'p1',
        status: ProjectInstallmentStatus.REQUEST_EDIT,
        request_edit_reason: 'Fix details',
      } as ProjectInstallment;

      txMock.projectInstallment.update.mockResolvedValue(mockUpdated);

      txMock.project.findUnique.mockImplementation(async (args: any) => {
        if (args?.select?.title) {
          return {
            id: 'p1',
            title: 'Project 1',
            responsible_unit_id: 'unit-1',
            created_by: 'creator-1',
            assignee_procurement: [],
            assignee_contract: [
              { id: 'contract-1', full_name: 'Contract One', email: null },
            ],
            creator: { id: 'creator-1', full_name: 'Creator One', email: null },
          };
        }

        return {
          id: 'p1',
          status: ProjectStatus.WAITING_CLOSE,
        };
      });
      txMock.user.findMany.mockResolvedValue([{ id: 'contract-1' }]);
      txMock.notification.findFirst.mockResolvedValue(null);
      txMock.notification.create.mockResolvedValue({
        id: 'notification-1',
        user_id: 'contract-1',
      });
      txMock.notification.groupBy.mockResolvedValue([
        { user_id: 'contract-1', _count: { _all: 1 } },
      ]);

      txMock.project.update.mockResolvedValue({
        id: 'p1',
        status: ProjectStatus.IN_PROGRESS,
      });

      const result = await requestEditInstallment(
        mockUser,
        'export-1',
        'Fix details'
      );

      expect(result).toEqual(mockUpdated);
      expect(txMock.project.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { status: ProjectStatus.IN_PROGRESS },
        select: { id: true, status: true },
      });
    });

    it('should revert project status from CLOSED to IN_PROGRESS when requestEditInstallment is called', async () => {
      txMock.projectInstallment.findUnique.mockResolvedValue({
        id: 'export-1',
        project_id: 'p1',
        installment_no: 1,
        status: ProjectInstallmentStatus.EXPORTED,
      } as ProjectInstallment);

      const mockUpdated = {
        id: 'export-1',
        project_id: 'p1',
        status: ProjectInstallmentStatus.REQUEST_EDIT,
        request_edit_reason: 'Fix details',
      } as ProjectInstallment;

      txMock.projectInstallment.update.mockResolvedValue(mockUpdated);

      txMock.project.findUnique.mockImplementation(async (args: any) => {
        if (args?.select?.title) {
          return {
            id: 'p1',
            title: 'Project 1',
            responsible_unit_id: 'unit-1',
            created_by: 'creator-1',
            assignee_procurement: [],
            assignee_contract: [
              { id: 'contract-1', full_name: 'Contract One', email: null },
            ],
            creator: { id: 'creator-1', full_name: 'Creator One', email: null },
          };
        }

        return {
          id: 'p1',
          status: ProjectStatus.CLOSED,
        };
      });
      txMock.user.findMany.mockResolvedValue([{ id: 'contract-1' }]);
      txMock.notification.findFirst.mockResolvedValue(null);
      txMock.notification.create.mockResolvedValue({
        id: 'notification-1',
        user_id: 'contract-1',
      });
      txMock.notification.groupBy.mockResolvedValue([
        { user_id: 'contract-1', _count: { _all: 1 } },
      ]);

      txMock.project.update.mockResolvedValue({
        id: 'p1',
        status: ProjectStatus.IN_PROGRESS,
      });

      const result = await requestEditInstallment(
        mockUser,
        'export-1',
        'Fix details'
      );

      expect(result).toEqual(mockUpdated);
      expect(txMock.project.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { status: ProjectStatus.IN_PROGRESS },
        select: { id: true, status: true },
      });
    });
  });
});
