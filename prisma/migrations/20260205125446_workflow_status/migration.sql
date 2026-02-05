-- CreateEnum
CREATE TYPE "ProjectPhaseStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'WAITING_APPROVAL', 'PENDING_PROPOSAL', 'PROPOSING', 'REJECTED', 'COMPLETED');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "contract_status" JSONB,
ADD COLUMN     "procurement_status" JSONB;
