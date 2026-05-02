/*
  Warnings:

  - You are about to drop the column `contract_no` on the `projects` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "projects" DROP COLUMN "contract_no";

-- CreateTable
CREATE TABLE "project_contract_numbers" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "project_id" TEXT,
    "contract_no" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_contract_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_contract_numbers_project_id_key" ON "project_contract_numbers"("project_id");

-- AddForeignKey
ALTER TABLE "project_contract_numbers" ADD CONSTRAINT "project_contract_numbers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
