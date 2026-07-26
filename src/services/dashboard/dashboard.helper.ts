import { Prisma, ProcurementType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError, ForbiddenError } from '../../lib/errors';
import {
  getUnitIdsForUser,
  haveSupplyPermission,
  isSuperAdmin,
} from '../../lib/permissions';
import {
  fromBangkokDate,
  nowUtc,
  toBangkokParts,
} from '../../lib/date';
import { AuthPayload } from '../../types/auth.type';
import { DashboardMetricComparison } from '../../types/dashboard.type';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_FISCAL_YEAR_OFFSET = 543;

export type DateRange = {
  from: Date;
  to: Date;
};

export const fiscalYearToGregorianEndYear = (fiscalYear: number): number =>
  fiscalYear > 2400 ? fiscalYear - DEFAULT_FISCAL_YEAR_OFFSET : fiscalYear;

export const currentFiscalYear = (now = nowUtc()): number => {
  const parts = toBangkokParts(now);
  const gregorianEndYear = parts.month >= 10 ? parts.year + 1 : parts.year;
  return gregorianEndYear + DEFAULT_FISCAL_YEAR_OFFSET;
};

export const fiscalYearRange = (fiscalYear: number): DateRange => {
  const endYear = fiscalYearToGregorianEndYear(fiscalYear);
  return {
    from: fromBangkokDate(endYear - 1, 10, 1),
    to: fromBangkokDate(endYear, 9, 30, true),
  };
};

export const currentFiscalYearStart = (now = nowUtc()): Date => {
  const parts = toBangkokParts(now);
  const startYear = parts.month >= 10 ? parts.year : parts.year - 1;
  return fromBangkokDate(startYear, 10, 1);
};

export const daysBetweenBangkokDates = (from: Date, to: Date): number => {
  const fromParts = toBangkokParts(from);
  const toParts = toBangkokParts(to);
  const fromDate = Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day);
  const toDate = Date.UTC(toParts.year, toParts.month - 1, toParts.day);
  return Math.ceil((toDate - fromDate) / DAY_MS);
};

export const resolveTargetUnitId = (
  user: AuthPayload,
  requestedUnitId?: string
): string => {
  const userUnitIds = getUnitIdsForUser(user);

  if (requestedUnitId) {
    if (isSuperAdmin(user) || haveSupplyPermission(user)) {
      return requestedUnitId;
    }
    if (userUnitIds.includes(requestedUnitId)) {
      return requestedUnitId;
    }
    throw new ForbiddenError('You do not have access to this unit');
  }

  if (userUnitIds.length > 0) {
    return userUnitIds[0];
  }

  throw new BadRequestError('unitId parameter is required');
};

export const andWhere = (
  ...clauses: Prisma.ProjectWhereInput[]
): Prisma.ProjectWhereInput => {
  const filtered = clauses
    .filter((clause) => Object.keys(clause).length > 0)
    .flatMap((clause) => {
      const maybeAnd = clause as { AND?: Prisma.ProjectWhereInput[] };
      return Object.keys(clause).length === 1 && Array.isArray(maybeAnd.AND)
        ? maybeAnd.AND
        : [clause];
    });
  if (filtered.length === 0) return {};
  if (filtered.length === 1) return filtered[0];
  return { AND: filtered };
};

export const projectRangeWhere = (
  visibilityWhere: Prisma.ProjectWhereInput,
  range: DateRange
): Prisma.ProjectWhereInput =>
  andWhere(visibilityWhere, {
    created_at: { gte: range.from, lte: range.to },
  });

export const toComparison = (
  current: number,
  previous: number
): DashboardMetricComparison => {
  const change = current - previous;
  return {
    current,
    previous,
    change,
    trend: change > 0 ? 'increase' : change < 0 ? 'decrease' : 'same',
  };
};

export const getProcurementTypeDonut = async (
  visibilityWhere: Prisma.ProjectWhereInput,
  range: DateRange,
  types?: ProcurementType[],
  extraWhere?: Prisma.ProjectWhereInput
) => {
  const typeFilters = types || Object.values(ProcurementType);
  const counts = await prisma.$transaction(
    typeFilters.map((type) =>
      prisma.project.count({
        where: andWhere(
          projectRangeWhere(visibilityWhere, range),
          extraWhere ?? {},
          { procurement_type: type }
        ),
      })
    )
  );

  return typeFilters.map((type, index) => ({
    type,
    count: counts[index],
  }));
};
