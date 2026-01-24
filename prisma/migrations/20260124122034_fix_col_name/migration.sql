/*
  Warnings:

  - You are about to drop the column `expect_approved_date` on the `projects` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "projects" DROP COLUMN "expect_approved_date",
ADD COLUMN     "expected_approval_date" TIMESTAMP(3);
