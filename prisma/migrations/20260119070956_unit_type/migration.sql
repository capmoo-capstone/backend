/*
  Warnings:

  - The `type` column on the `units` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "UnitResponsibleType" AS ENUM ('LT100K', 'LT500K', 'MT500K', 'SELECTION', 'EBIDDING', 'CONTRACT');

-- AlterTable
ALTER TABLE "units" DROP COLUMN "type",
ADD COLUMN     "type" "UnitResponsibleType"[];
