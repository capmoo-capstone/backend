/*
  Warnings:

  - You are about to drop the column `budget_no` on the `budget_plans` table. All the data in the column will be lost.
  - You are about to drop the column `unit_no` on the `budget_plans` table. All the data in the column will be lost.
  - You are about to drop the column `budget_plan_id` on the `projects` table. All the data in the column will be lost.
  - Changed the type of `budget_year` on the `budget_plans` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterEnum
ALTER TYPE "ProjectPhaseStatus" ADD VALUE 'NOT_EXPORTED';

-- AlterTable
ALTER TABLE "budget_plans"
  DROP COLUMN "budget_no",
  DROP COLUMN "unit_no",
  ALTER COLUMN "budget_year" TYPE INTEGER
  USING trim("budget_year")::INTEGER,
  ALTER COLUMN "budget_year" SET NOT NULL;

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "budget_plan_id",
ADD COLUMN     "expected_completion_procurement_date" TIMESTAMP(3),
ADD COLUMN     "request_edit_reason" TEXT;
