import { ProcurementType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

export const getProcurementTypeToUnitIdMap = async (
  tx?: Prisma.TransactionClient
): Promise<Map<ProcurementType, string | null>> => {
  const client = tx ?? prisma;
  const procurementTypes = Object.values(ProcurementType);

  const units = await client.unit.findMany({
    where: { type: { hasSome: procurementTypes } },
    select: { id: true, type: true },
  });

  const map = new Map<ProcurementType, string | null>(
    procurementTypes.map((type) => [type, null])
  );

  for (const unit of units) {
    for (const t of unit.type) {
      if (map.get(t as ProcurementType) === null) {
        map.set(t as ProcurementType, unit.id);
      }
    }
  }

  return map;
};
