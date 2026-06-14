import { Response } from 'express';
import { AuditLogsQuerySchema } from '../schemas/admin.schema';
import * as AuditLogService from '../services/audit-log.service';
import * as SettingsService from '../services/settings.service';
import { AuthenticatedRequest } from '../types/auth.type';

export const getAuditLogs = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Admin']
  // #swagger.security = [{ bearerAuth: [] }]
  const user = req.user!;
  const {
    page,
    limit,
    q,
    kind,
    eventType,
    projectId,
    actorId,
    dateFrom,
    dateTo,
  } = req.query;
  const query = AuditLogsQuerySchema.parse({
    q: q as string,
    kind,
    eventType,
    projectId,
    actorId,
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

export const getOpsUnits = async (
  _req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Admin']
  // #swagger.security = [{ bearerAuth: [] }]
  const data = await SettingsService.getOpsUnits();
  res.status(200).json(data);
};

export const getRepresentatives = async (
  _req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Admin']
  // #swagger.security = [{ bearerAuth: [] }]
  const data = await SettingsService.getRepresentatives();
  res.status(200).json(data);
};

export const getOpsStaff = async (
  _req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Admin']
  // #swagger.security = [{ bearerAuth: [] }]
  const data = await SettingsService.getOpsStaff();
  res.status(200).json(data);
};
