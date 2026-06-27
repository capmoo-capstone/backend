/*
  Warnings:

  - You are about to drop the column `approved_at` on the `project_cancellations` table. All the data in the column will be lost.
  - You are about to drop the column `approved_by` on the `project_cancellations` table. All the data in the column will be lost.
  - You are about to drop the column `cancelled_at` on the `project_cancellations` table. All the data in the column will be lost.
  - You are about to drop the column `is_active` on the `project_cancellations` table. All the data in the column will be lost.
  - You are about to drop the column `is_cancelled` on the `project_cancellations` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "project_cancellations" DROP CONSTRAINT "project_cancellations_approved_by_fkey";

-- DropIndex
DROP INDEX "project_cancellations_project_id_is_active_idx";

-- AlterTable
ALTER TABLE "project_cancellations" DROP COLUMN "approved_at",
DROP COLUMN "approved_by",
DROP COLUMN "cancelled_at",
DROP COLUMN "is_active",
DROP COLUMN "is_cancelled";

-- CreateIndex
CREATE INDEX "project_cancellations_project_id_idx" ON "project_cancellations"("project_id");

-- AddForeignKey
ALTER TABLE "project_cancellations" ADD CONSTRAINT "project_cancellations_decision_by_fkey" FOREIGN KEY ("decision_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
