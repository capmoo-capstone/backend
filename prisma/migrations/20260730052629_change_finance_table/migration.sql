/*
  Warnings:

  - You are about to drop the `project_finance_exports` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ProjectInstallmentStatus" AS ENUM ('WAITING_EXPORT', 'EXPORTED', 'REQUEST_EDIT');

-- DropForeignKey
ALTER TABLE "project_finance_exports" DROP CONSTRAINT "project_finance_exports_created_by_fkey";

-- DropForeignKey
ALTER TABLE "project_finance_exports" DROP CONSTRAINT "project_finance_exports_exported_by_fkey";

-- DropForeignKey
ALTER TABLE "project_finance_exports" DROP CONSTRAINT "project_finance_exports_project_id_fkey";

-- DropTable
DROP TABLE "project_finance_exports";

-- DropEnum
DROP TYPE "ProjectFinanceExportStatus";

-- CreateTable
CREATE TABLE "project_installments" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "installment_no" INTEGER NOT NULL,
    "status" "ProjectInstallmentStatus" NOT NULL DEFAULT 'WAITING_EXPORT',
    "request_edit_reason" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exported_by" TEXT,
    "exported_at" TIMESTAMP(3),

    CONSTRAINT "project_installments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_installments_status_idx" ON "project_installments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "project_installments_project_id_installment_no_key" ON "project_installments"("project_id", "installment_no");

-- AddForeignKey
ALTER TABLE "project_installments" ADD CONSTRAINT "project_installments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_installments" ADD CONSTRAINT "project_installments_exported_by_fkey" FOREIGN KEY ("exported_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_installments" ADD CONSTRAINT "project_installments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
