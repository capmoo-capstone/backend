/*
  Warnings:

  - A unique constraint covering the columns `[project_id,installment_no]` on the table `project_finance_exports` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `created_by` to the `project_finance_exports` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "project_finance_exports" DROP CONSTRAINT "project_finance_exports_exported_by_fkey";

-- DropIndex
DROP INDEX "project_finance_exports_project_id_installment_no_idx";

-- AlterTable
ALTER TABLE "project_finance_exports" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by" TEXT NOT NULL,
ALTER COLUMN "exported_by" DROP NOT NULL,
ALTER COLUMN "exported_at" DROP NOT NULL,
ALTER COLUMN "exported_at" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "project_finance_exports_project_id_installment_no_key" ON "project_finance_exports"("project_id", "installment_no");

-- AddForeignKey
ALTER TABLE "project_finance_exports" ADD CONSTRAINT "project_finance_exports_exported_by_fkey" FOREIGN KEY ("exported_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_finance_exports" ADD CONSTRAINT "project_finance_exports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
