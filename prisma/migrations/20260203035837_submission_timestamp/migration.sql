/*
  Warnings:

  - You are about to drop the column `action_at` on the `project_submissions` table. All the data in the column will be lost.
  - You are about to drop the column `action_by` on the `project_submissions` table. All the data in the column will be lost.
  - You are about to drop the column `signed_at` on the `project_submissions` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "project_submissions" DROP CONSTRAINT "project_submissions_action_by_fkey";

-- AlterTable
ALTER TABLE "project_submissions" DROP COLUMN "action_at",
DROP COLUMN "action_by",
DROP COLUMN "signed_at",
ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by" TEXT,
ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "completed_by" TEXT,
ADD COLUMN     "proposing_at" TIMESTAMP(3),
ADD COLUMN     "proposing_by" TEXT;

-- AddForeignKey
ALTER TABLE "project_submissions" ADD CONSTRAINT "project_submissions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
