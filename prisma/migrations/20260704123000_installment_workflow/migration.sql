ALTER TABLE "projects"
ADD COLUMN "installment_rounds" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "project_submissions"
ADD COLUMN "installment_no" INTEGER;

UPDATE "project_submissions"
SET "installment_no" = 1
WHERE "workflow_type" = 'CONTRACT';

CREATE INDEX "project_submissions_project_id_workflow_type_installment_no_step_order_submission_type_idx"
ON "project_submissions"("project_id", "workflow_type", "installment_no", "step_order", "submission_type");
