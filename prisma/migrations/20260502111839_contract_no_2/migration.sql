/*
  Warnings:

  - A unique constraint covering the columns `[type,contract_no]` on the table `project_contract_numbers` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "project_contract_numbers" DROP CONSTRAINT "project_contract_numbers_project_id_fkey";

-- DropIndex
DROP INDEX "project_contract_numbers_project_id_key";

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "contract_no_id" TEXT;

-- CreateIndex
CREATE INDEX "project_contract_numbers_project_id_is_active_idx" ON "project_contract_numbers"("project_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "project_contract_numbers_type_contract_no_key" ON "project_contract_numbers"("type", "contract_no");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_contract_no_id_fkey" FOREIGN KEY ("contract_no_id") REFERENCES "project_contract_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
