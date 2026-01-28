/*
  Warnings:

  - The values [PROCUREMENT_UNASSIGNED,PROCUREMENT_WAITING_ACCEPTANCE,PROCUREMENT_IN_PROGRESS,CONTRACT_UNASSIGNED,CONTRACT_WAITING_ACCEPTANCE,CONTRACT_IN_PROGRESS,APPROVED] on the enum `ProjectStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [UNDER_REVIEW] on the enum `SubmissionStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `current_templates_id` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `request_unit_id` on the `projects` table. All the data in the column will be lost.
  - Added the required column `current_template_id` to the `projects` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ProjectStatus_new" AS ENUM ('UNASSIGNED', 'WAITING_ACCEPT', 'IN_PROGRESS', 'WAITING_CANCEL', 'CANCELLED', 'NOT_EXPORT', 'EXPORTED', 'CLOSED', 'REQUEST_EDIT');
ALTER TABLE "projects" ALTER COLUMN "status" TYPE "ProjectStatus_new" USING ("status"::text::"ProjectStatus_new");
ALTER TYPE "ProjectStatus" RENAME TO "ProjectStatus_old";
ALTER TYPE "ProjectStatus_new" RENAME TO "ProjectStatus";
DROP TYPE "public"."ProjectStatus_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "SubmissionStatus_new" AS ENUM ('SUBMITTED', 'ACCEPTED', 'REJECTED');
ALTER TABLE "project_submissions" ALTER COLUMN "status" TYPE "SubmissionStatus_new" USING ("status"::text::"SubmissionStatus_new");
ALTER TABLE "vendor_submissions" ALTER COLUMN "status" TYPE "SubmissionStatus_new" USING ("status"::text::"SubmissionStatus_new");
ALTER TYPE "SubmissionStatus" RENAME TO "SubmissionStatus_old";
ALTER TYPE "SubmissionStatus_new" RENAME TO "SubmissionStatus";
DROP TYPE "public"."SubmissionStatus_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_current_templates_id_fkey";

-- AlterTable
ALTER TABLE "project_cancellations" ADD COLUMN     "is_cancelled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "current_templates_id",
DROP COLUMN "request_unit_id",
ADD COLUMN     "current_template_id" TEXT NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "less_no" TEXT,
ADD COLUMN     "requesting_unit_id" TEXT;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_current_template_id_fkey" FOREIGN KEY ("current_template_id") REFERENCES "workflow_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_requesting_unit_id_fkey" FOREIGN KEY ("requesting_unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
