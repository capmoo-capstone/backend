/*
  Warnings:

  - You are about to drop the column `contract_phase_status` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `procurement_phase_status` on the `projects` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "project_cancellations" DROP CONSTRAINT "project_cancellations_project_id_fkey";

-- DropForeignKey
ALTER TABLE "project_histories" DROP CONSTRAINT "project_histories_project_id_fkey";

-- DropForeignKey
ALTER TABLE "project_submissions" DROP CONSTRAINT "project_submissions_project_id_fkey";

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "contract_phase_status",
DROP COLUMN "procurement_phase_status",
ADD COLUMN     "budget_plan_id" TEXT[],
ADD COLUMN     "contract_status" "ProjectPhaseStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "procurement_status" "ProjectPhaseStatus" NOT NULL DEFAULT 'NOT_STARTED';

-- CreateTable
CREATE TABLE "budget_plans" (
    "id" TEXT NOT NULL,
    "budget_year" TEXT NOT NULL,
    "cost_center_no" TEXT NOT NULL,
    "cost_center_name" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "activity_type" TEXT NOT NULL,
    "activity_type_name" TEXT NOT NULL,
    "description" TEXT,
    "budget_amount" DECIMAL(18,2) NOT NULL,
    "project_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "budget_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_histories_project_id_idx" ON "project_histories"("project_id");

-- CreateIndex
CREATE INDEX "project_histories_changed_at_idx" ON "project_histories"("changed_at");

-- CreateIndex
CREATE INDEX "project_submissions_project_id_submitted_at_idx" ON "project_submissions"("project_id", "submitted_at" DESC);

-- CreateIndex
CREATE INDEX "project_submissions_project_id_step_order_submission_type_idx" ON "project_submissions"("project_id", "step_order", "submission_type");

-- CreateIndex
CREATE INDEX "projects_receive_no_idx" ON "projects"("receive_no" DESC);

-- CreateIndex
CREATE INDEX "projects_status_current_workflow_type_idx" ON "projects"("status", "current_workflow_type");

-- CreateIndex
CREATE INDEX "projects_requesting_dept_id_idx" ON "projects"("requesting_dept_id");

-- CreateIndex
CREATE INDEX "user_organization_roles_user_id_idx" ON "user_organization_roles"("user_id");

-- AddForeignKey
ALTER TABLE "project_cancellations" ADD CONSTRAINT "project_cancellations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_histories" ADD CONSTRAINT "project_histories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_submissions" ADD CONSTRAINT "project_submissions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_plans" ADD CONSTRAINT "budget_plans_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_plans" ADD CONSTRAINT "budget_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
