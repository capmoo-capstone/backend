/*
  Warnings:

  - You are about to drop the column `expected_completion_procurement_date` on the `projects` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "notification_outbox" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "project_submissions" ADD COLUMN     "staff_remark" TEXT;

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "expected_completion_procurement_date";
