import { NextFunction, Request, Response } from 'express';
import { formatBangkokDate, formatBangkokOffset } from '../utils/date';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  Object.getPrototypeOf(value) === Object.prototype;

export const serializeBangkokDates = (
  value: unknown,
  dateOnlyKeys: Set<string>,
  key?: string
): unknown => {
  if (value instanceof Date) {
    return key && dateOnlyKeys.has(key)
      ? formatBangkokDate(value)
      : formatBangkokOffset(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeBangkokDates(item, dateOnlyKeys));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        serializeBangkokDates(entryValue, dateOnlyKeys, entryKey),
      ])
    );
  }

  return value;
};

export const bangkokDateResponse = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const json = res.json.bind(res);
  const isHolidayResponse = req.path.startsWith('/api/v1/holidays');
  const dateOnlyKeys = isHolidayResponse
    ? new Set(['date'])
    : new Set<string>();

  res.json = (body?: unknown) =>
    json(serializeBangkokDates(body, dateOnlyKeys));
  next();
};
