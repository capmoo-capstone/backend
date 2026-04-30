import { Response } from 'express';
import { AuditLogsQuerySchema } from '../schemas/admin.schema';
import * as AuditLogService from '../services/audit-log.service';
import { AuthenticatedRequest } from '../types/auth.type';

export const getAuditLogs = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Admin']
  // #swagger.security = [{ bearerAuth: [] }]
  const user = req.user!;
  const { page, limit, q, kind, dateFrom, dateTo } = req.query;
  const query = AuditLogsQuerySchema.parse({
    q: q as string,
    kind,
    dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
    dateTo: dateTo ? new Date(dateTo as string) : undefined,
  });
  const auditLogs = await AuditLogService.listAuditLogs(
    user,
    parseInt(page as string) || 1,
    parseInt(limit as string) || 10,
    query
  );

  res.status(200).json(auditLogs);
};
