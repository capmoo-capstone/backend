/*
  Warnings:

  - Changed the type of `activity_type` on the `budget_plans` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "budget_plans"
  ALTER COLUMN "activity_type" TYPE INTEGER
  USING trim("activity_type")::INTEGER,
  ALTER COLUMN "activity_type" SET NOT NULL;
