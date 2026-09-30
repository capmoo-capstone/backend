/*
  Warnings:

  - You are about to drop the column `migo_103_no` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `migo_105_no` on the `projects` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "projects" DROP COLUMN "migo_103_no",
DROP COLUMN "migo_105_no";
