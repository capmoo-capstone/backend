import { Response } from 'express';
import * as HolidayService from '../services/holiday.service';
import {
  CreateHolidaySchema,
  UpdateHolidaySchema,
  HolidayQuerySchema,
  CalculateTimelineSchema,
} from '../schemas/holiday.schema';
import { AuthenticatedRequest } from '../types/auth.type';

export const getAll = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  // #swagger.tags = ['Holidays']
  // #swagger.security = [{ bearerAuth: [] }]
  const { year } = HolidayQuerySchema.parse(req.query);
  const data = await HolidayService.listHolidays(year);
  res.status(200).json(data);
};

export const create = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  // #swagger.tags = ['Holidays']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/CreateHolidayDto' } }
  const validatedData = CreateHolidaySchema.parse(req.body);
  const data = await HolidayService.createHoliday(validatedData);
  res.status(201).json(data);
};

export const update = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  // #swagger.tags = ['Holidays']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/UpdateHolidayDto' } }
  const id = req.params.id as string;
  const validatedData = UpdateHolidaySchema.parse(req.body);
  const data = await HolidayService.updateHoliday(id, validatedData);
  res.status(200).json(data);
};

export const remove = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  // #swagger.tags = ['Holidays']
  // #swagger.security = [{ bearerAuth: [] }]
  const id = req.params.id as string;
  await HolidayService.deleteHoliday(id);
  res.status(204).send();
};

export const calculateTimeline = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  // #swagger.tags = ['Holidays']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/CalculateTimelineDto' } }
  const validatedData = CalculateTimelineSchema.parse(req.body);
  const data = await HolidayService.calculateTimeline(validatedData);
  res.status(200).json(data);
};
