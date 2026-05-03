/*
  Warnings:

  - You are about to drop the column `project_id` on the `project_contract_numbers` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[contract_no_id]` on the table `projects` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "project_contract_numbers_project_id_is_active_idx";

-- AlterTable
ALTER TABLE "project_contract_numbers" DROP COLUMN "project_id";

-- CreateIndex
CREATE INDEX "project_contract_numbers_is_active_idx" ON "project_contract_numbers"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "projects_contract_no_id_key" ON "projects"("contract_no_id");
