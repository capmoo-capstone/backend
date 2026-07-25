/*
  Warnings:

  - The values [REQUEST_EDIT] on the enum `ProjectStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `is_exported` on the `project_finance_exports` table. All the data in the column will be lost.
  - You are about to drop the column `request_edit_reason` on the `projects` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ProjectFinanceExportStatus" AS ENUM ('WAITING_EXPORT', 'EXPORTED', 'REQUEST_EDIT');

-- AlterEnum
BEGIN;
CREATE TYPE "ProjectStatus_new" AS ENUM ('UNASSIGNED', 'WAITING_ACCEPT', 'IN_PROGRESS', 'WAITING_CANCEL', 'CANCELLED', 'CLOSED');
ALTER TABLE "projects" ALTER COLUMN "status" TYPE "ProjectStatus_new" USING ("status"::text::"ProjectStatus_new");
ALTER TYPE "ProjectStatus" RENAME TO "ProjectStatus_old";
ALTER TYPE "ProjectStatus_new" RENAME TO "ProjectStatus";
DROP TYPE "public"."ProjectStatus_old";
COMMIT;

-- DropIndex
DROP INDEX "project_finance_exports_is_exported_idx";

-- AlterTable
ALTER TABLE "project_finance_exports" DROP COLUMN "is_exported",
ADD COLUMN     "request_edit_reason" TEXT,
ADD COLUMN     "status" "ProjectFinanceExportStatus" NOT NULL DEFAULT 'WAITING_EXPORT';

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "request_edit_reason";

-- CreateIndex
CREATE INDEX "project_finance_exports_status_idx" ON "project_finance_exports"("status");
