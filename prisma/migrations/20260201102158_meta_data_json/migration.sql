/*
  Warnings:

  - The `meta_data` column on the `project_submissions` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "project_submissions" DROP COLUMN "meta_data",
ADD COLUMN     "meta_data" JSONB[];
