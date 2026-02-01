/*
  Warnings:

  - The `submission_round` column on the `project_submissions` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "project_submissions" DROP COLUMN "submission_round",
ADD COLUMN     "submission_round" INTEGER NOT NULL DEFAULT 1;
