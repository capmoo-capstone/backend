/*
  Warnings:

  - You are about to drop the column `cost_center_name` on the `budget_plans` table. All the data in the column will be lost.
  - You are about to drop the column `cost_center_no` on the `budget_plans` table. All the data in the column will be lost.
  - You are about to drop the column `department_id` on the `budget_plans` table. All the data in the column will be lost.
  - Added the required column `unit_id` to the `budget_plans` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unit_no` to the `budget_plans` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "budget_plans" DROP CONSTRAINT "budget_plans_department_id_fkey";

-- AlterTable
ALTER TABLE "budget_plans" DROP COLUMN "cost_center_name",
DROP COLUMN "cost_center_no",
DROP COLUMN "department_id",
ADD COLUMN     "budget_name" TEXT,
ADD COLUMN     "budget_no" TEXT,
ADD COLUMN     "unit_id" TEXT NOT NULL,
ADD COLUMN     "unit_no" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "budget_plans" ADD CONSTRAINT "budget_plans_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
