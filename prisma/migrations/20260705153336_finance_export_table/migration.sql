-- CreateTable
CREATE TABLE "project_finance_exports" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "installment_no" INTEGER NOT NULL,
    "is_exported" BOOLEAN NOT NULL DEFAULT false,
    "exported_by" TEXT NOT NULL,
    "exported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_finance_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_finance_exports_project_id_installment_no_idx" ON "project_finance_exports"("project_id", "installment_no");

-- CreateIndex
CREATE INDEX "project_finance_exports_is_exported_idx" ON "project_finance_exports"("is_exported");

-- AddForeignKey
ALTER TABLE "project_finance_exports" ADD CONSTRAINT "project_finance_exports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_finance_exports" ADD CONSTRAINT "project_finance_exports_exported_by_fkey" FOREIGN KEY ("exported_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "project_submissions_project_id_workflow_type_installment_no_ste" RENAME TO "project_submissions_project_id_workflow_type_installment_no_idx";
