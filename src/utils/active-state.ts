import { Prisma } from '@prisma/client';
import { nowUtc } from './date';

type DelegationWindow = {
  start_date: Date;
  end_date: Date | null;
};

export const activeUserWhere = (): Prisma.UserWhereInput => ({
  is_active: true,
});

/** A delegation that is effective at the supplied instant. */
export const activeDelegationWhere = (
  now: Date = nowUtc()
): Prisma.UserDelegationWhereInput => ({
  is_active: true,
  cancelled_at: null,
  start_date: { lte: now },
  OR: [{ end_date: null }, { end_date: { gte: now } }],
});

/** A delegation that has not ended or been cancelled, including scheduled ones. */
export const openDelegationWhere = (
  now: Date = nowUtc()
): Prisma.UserDelegationWhereInput => ({
  is_active: true,
  cancelled_at: null,
  OR: [{ end_date: null }, { end_date: { gte: now } }],
});

export const activeContractNumberWhere =
  (): Prisma.ProjectContractNumberWhereInput => ({
    is_active: true,
  });

/**
 * Returns the next instant at which the cached authorization data may change:
 * a scheduled delegation starts or an active delegation ends.
 */
export const getNextDelegationBoundary = (
  delegations: readonly DelegationWindow[],
  now: Date = nowUtc()
): Date | null => {
  const candidates = delegations.flatMap((delegation) => {
    const boundaries = [delegation.start_date, delegation.end_date].filter(
      (value): value is Date =>
        value !== null && value.getTime() > now.getTime()
    );
    return boundaries;
  });

  if (candidates.length === 0) return null;
  return new Date(Math.min(...candidates.map((date) => date.getTime())));
};
