/*
  Warnings:

  - You are about to drop the column `migo_no` on the `projects` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "projects" DROP COLUMN "migo_no",
ADD COLUMN     "migo_103_no" TEXT,
ADD COLUMN     "migo_105_no" TEXT;
