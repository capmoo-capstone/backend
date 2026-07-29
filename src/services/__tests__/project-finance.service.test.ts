import {
  ProjectFinanceExport,
  ProjectFinanceExportStatus,
  UnitResponsibleType,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { prismaMock, txMock } from '../../test/prisma-mock';
import { AuthPayload } from '../../types/auth.type';
import {
  createFinanceExportRequest,
  exportFinanceData,
  getFinanceExportRequest,
  requestEditInstallment,
} from '../project-finance.service';

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  full_name: 'Test User',
  roles: [],
} as unknown as AuthPayload;

describe('project-finance.service', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
  });

  describe('createFinanceExportRequest', () => {
    const dto = {
      id: 'project-uuid-1',
      installment_no: 2,
    };

    it('should throw NotFoundError if project is not found', async () => {
      txMock.project.findUnique.mockResolvedValue(null);

      await expect(
        createFinanceExportRequest(mockUser, dto)
      ).rejects.toThrow(NotFoundError);

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

      await expect(
        createFinanceExportRequest(mockUser, dto)
      ).rejects.toThrow(
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

    it('should upsert projectFinanceExport when all validations pass', async () => {
      txMock.project.findUnique.mockResolvedValue({
        installment_rounds: 3,
        current_workflow_type: UnitResponsibleType.CONTRACT,
      });

      const mockExportResult = {
        id: 'export-uuid',
        project_id: dto.id,
        installment_no: dto.installment_no,
        status: ProjectFinanceExportStatus.WAITING_EXPORT,
        created_by: mockUser.id,
        created_at: new Date('2026-06-01T00:00:00.000Z'),
      } as ProjectFinanceExport;

      txMock.projectFinanceExport.upsert.mockResolvedValue(mockExportResult);
      txMock.projectFinanceExport.count.mockResolvedValue(2);

      const result = await createFinanceExportRequest(mockUser, dto);

      expect(result).toEqual(mockExportResult);
      expect(txMock.projectFinanceExport.upsert).toHaveBeenCalledWith({
        where: {
          project_id_installment_no: {
            project_id: dto.id,
            installment_no: dto.installment_no,
          },
        },
        create: {
          project_id: dto.id,
          installment_no: dto.installment_no,
          status: ProjectFinanceExportStatus.WAITING_EXPORT,
          created_by: mockUser.id,
        },
        update: {
          status: ProjectFinanceExportStatus.WAITING_EXPORT,
        },
      });
    });

    it('records contract completion when the final installment export is created', async () => {
      const completedAt = new Date('2026-06-02T00:00:00.000Z');
      txMock.project.findUnique.mockResolvedValue({
        installment_rounds: 2,
        current_workflow_type: UnitResponsibleType.CONTRACT,
        contract_completed_at: null,
      });
      txMock.projectFinanceExport.upsert.mockResolvedValue({
        id: 'export-final',
        project_id: dto.id,
        installment_no: dto.installment_no,
        status: ProjectFinanceExportStatus.WAITING_EXPORT,
        created_by: mockUser.id,
        created_at: completedAt,
      });
      txMock.projectFinanceExport.count.mockResolvedValue(2);

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
      txMock.projectFinanceExport.upsert.mockResolvedValue({
        id: 'export-final',
        project_id: dto.id,
        installment_no: dto.installment_no,
        status: ProjectFinanceExportStatus.WAITING_EXPORT,
        created_by: mockUser.id,
        created_at: new Date('2026-06-02T00:00:00.000Z'),
      });
      txMock.projectFinanceExport.count.mockResolvedValue(2);

      await createFinanceExportRequest(mockUser, dto);

      expect(txMock.project.update).not.toHaveBeenCalled();
    });
  });

  describe('getFinanceExportRequest', () => {
    it('should return a paginated response with export requests and total count', async () => {
      const mockExports = [
        {
          id: '1',
          project_id: 'p1',
          installment_no: 1,
          status: ProjectFinanceExportStatus.WAITING_EXPORT,
        },
        {
          id: '2',
          project_id: 'p2',
          installment_no: 2,
          status: ProjectFinanceExportStatus.EXPORTED,
        },
      ] as ProjectFinanceExport[];

      prismaMock.projectFinanceExport.findMany.mockResolvedValue(mockExports);
      prismaMock.projectFinanceExport.count.mockResolvedValue(10);

      const page = 2;
      const limit = 2;
      const result = await getFinanceExportRequest(mockUser, page, limit);

      expect(result).toEqual({
        total: 10,
        page,
        pageSize: limit,
        totalPages: 5,
        data: mockExports,
      });

      expect(prismaMock.projectFinanceExport.findMany).toHaveBeenCalledWith({
        orderBy: { created_at: 'desc' },
        skip: 2,
        take: 2,
      });
      expect(prismaMock.projectFinanceExport.count).toHaveBeenCalled();
    });
  });

  describe('exportFinanceData', () => {
    const exportDto = {
      id: ['export-1', 'export-2'],
    };

    it('should throw BadRequestError if requested export requests do not match the expected count', async () => {
      txMock.projectFinanceExport.count.mockResolvedValue(1);

      await expect(
        exportFinanceData(mockUser, exportDto)
      ).rejects.toThrow(
        new BadRequestError(
          'Some export requests are already exported or not found'
        )
      );

      expect(txMock.projectFinanceExport.count).toHaveBeenCalledWith({
        where: {
          id: { in: exportDto.id },
          status: {
            in: [
              ProjectFinanceExportStatus.WAITING_EXPORT,
              ProjectFinanceExportStatus.REQUEST_EDIT,
            ],
          },
        },
      });
    });

    it('should update requests to status EXPORTED and return list response', async () => {
      txMock.projectFinanceExport.count.mockResolvedValue(2);

      const mockUpdated = [
        {
          id: 'export-1',
          project_id: 'p1',
          installment_no: 1,
          status: ProjectFinanceExportStatus.EXPORTED,
        },
        {
          id: 'export-2',
          project_id: 'p2',
          installment_no: 2,
          status: ProjectFinanceExportStatus.EXPORTED,
        },
      ];

      txMock.projectFinanceExport.updateManyAndReturn.mockResolvedValue(
        mockUpdated as unknown as ProjectFinanceExport[]
      );

      const result = await exportFinanceData(mockUser, exportDto);

      expect(result).toEqual({
        total: 2,
        data: mockUpdated,
      });

      expect(txMock.projectFinanceExport.updateManyAndReturn).toHaveBeenCalledWith({
        where: {
          id: { in: exportDto.id },
          status: {
            in: [
              ProjectFinanceExportStatus.WAITING_EXPORT,
              ProjectFinanceExportStatus.REQUEST_EDIT,
            ],
          },
        },
        data: {
          status: ProjectFinanceExportStatus.EXPORTED,
          exported_by: mockUser.id,
          exported_at: new Date('2026-06-01T00:00:00.000Z'),
        },
      });
    });
  });

  describe('requestEditInstallment', () => {
    it('should throw NotFoundError if export record is not found', async () => {
      txMock.projectFinanceExport.findUnique.mockResolvedValue(null);

      await expect(
        requestEditInstallment(mockUser, 'non-existent-id', 'Fix details')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BadRequestError if export status is not EXPORTED', async () => {
      txMock.projectFinanceExport.findUnique.mockResolvedValue({
        id: 'export-1',
        status: ProjectFinanceExportStatus.WAITING_EXPORT,
      } as ProjectFinanceExport);

      await expect(
        requestEditInstallment(mockUser, 'export-1', 'Fix details')
      ).rejects.toThrow(
        new BadRequestError(
          'Installment export request must be in EXPORTED status to request edit'
        )
      );
    });

    it('should update status to REQUEST_EDIT and set request_edit_reason', async () => {
      txMock.projectFinanceExport.findUnique.mockResolvedValue({
        id: 'export-1',
        status: ProjectFinanceExportStatus.EXPORTED,
      } as ProjectFinanceExport);

      const mockUpdated = {
        id: 'export-1',
        status: ProjectFinanceExportStatus.REQUEST_EDIT,
        request_edit_reason: 'Fix details',
      } as ProjectFinanceExport;

      txMock.projectFinanceExport.update.mockResolvedValue(mockUpdated);

      const result = await requestEditInstallment(
        mockUser,
        'export-1',
        'Fix details'
      );

      expect(result).toEqual(mockUpdated);
      expect(txMock.projectFinanceExport.update).toHaveBeenCalledWith({
        where: { id: 'export-1' },
        data: {
          status: ProjectFinanceExportStatus.REQUEST_EDIT,
          request_edit_reason: 'Fix details',
        },
      });
    });
  });
});
