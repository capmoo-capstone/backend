-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'HEAD_OF_DEPARTMENT', 'HEAD_OF_UNIT', 'REPRESENTATIVE', 'DOCUMENT_STAFF', 'FINANCE_STAFF', 'GENERAL_STAFF', 'GUEST');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('UNASSIGNED', 'WAITING_ACCEPT', 'IN_PROGRESS', 'WAITING_CANCEL', 'CANCELLED', 'CLOSED', 'REQUEST_EDIT');

-- CreateEnum
CREATE TYPE "UnitResponsibleType" AS ENUM ('LT100K', 'LT500K', 'MT500K', 'SELECTION', 'EBIDDING', 'INTERNAL', 'CONTRACT');

-- CreateEnum
CREATE TYPE "LogActionType" AS ENUM ('INFORMATION_UPDATE', 'STATUS_UPDATE', 'ASSIGNEE_UPDATE', 'STEP_UPDATE');

-- CreateEnum
CREATE TYPE "ProcurementType" AS ENUM ('LT100K', 'LT500K', 'MT500K', 'SELECTION', 'EBIDDING', 'INTERNAL');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('WAITING_APPROVAL', 'WAITING_PROPOSAL', 'WAITING_SIGNATURE', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProjectPhaseStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'WAITING_APPROVAL', 'WAITING_PROPOSAL', 'WAITING_SIGNATURE', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SubmissionType" AS ENUM ('STAFF', 'VENDOR');

-- CreateEnum
CREATE TYPE "UrgentType" AS ENUM ('NORMAL', 'URGENT', 'VERY_URGENT');

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "dept_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "UnitResponsibleType"[],

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "full_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_delegations" (
    "id" TEXT NOT NULL,
    "delegator_id" TEXT NOT NULL,
    "delegatee_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_delegations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_organization_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "dept_id" TEXT NOT NULL,
    "unit_id" TEXT,

    CONSTRAINT "user_organization_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "receive_no" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "budget" DECIMAL(18,2) NOT NULL,
    "status" "ProjectStatus" NOT NULL,
    "procurement_type" "ProcurementType" NOT NULL,
    "current_workflow_type" "UnitResponsibleType" NOT NULL,
    "responsible_unit_id" TEXT NOT NULL,
    "requesting_dept_id" TEXT NOT NULL,
    "requesting_unit_id" TEXT,
    "is_urgent" "UrgentType" NOT NULL DEFAULT 'NORMAL',
    "expected_approval_date" TIMESTAMP(3),
    "procurement_status" "ProjectPhaseStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "procurement_step" INTEGER,
    "contract_status" "ProjectPhaseStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "contract_step" INTEGER,
    "budget_plan_id" TEXT[],
    "pr_no" TEXT,
    "po_no" TEXT,
    "less_no" TEXT,
    "contract_no" TEXT,
    "migo_no" TEXT,
    "vendor_name" TEXT,
    "vendor_tax_id" TEXT,
    "vendor_email" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_cancellations" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
    "requested_by" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "project_cancellations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_histories" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "action" "LogActionType" NOT NULL,
    "old_value" JSONB NOT NULL,
    "new_value" JSONB NOT NULL,
    "comment" TEXT,
    "changed_by" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_submissions" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "workflow_type" "UnitResponsibleType" NOT NULL,
    "step_order" INTEGER NOT NULL,
    "submission_type" "SubmissionType" NOT NULL DEFAULT 'STAFF',
    "submission_round" INTEGER NOT NULL,
    "po_no" TEXT,
    "status" "SubmissionStatus" NOT NULL,
    "submitted_by" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "proposing_by" TEXT,
    "proposing_at" TIMESTAMP(3),
    "completed_by" TEXT,
    "completed_at" TIMESTAMP(3),
    "comment" TEXT,
    "meta_data" JSONB[],

    CONSTRAINT "project_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_documents" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "field_key" TEXT,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,

    CONSTRAINT "project_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_plans" (
    "id" TEXT NOT NULL,
    "budget_year" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "unit_no" TEXT NOT NULL,
    "activity_type" TEXT NOT NULL,
    "activity_type_name" TEXT NOT NULL,
    "description" TEXT,
    "budget_no" TEXT,
    "budget_name" TEXT,
    "budget_amount" DECIMAL(18,2) NOT NULL,
    "project_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "budget_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ProcurementProjects" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProcurementProjects_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ContractProjects" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ContractProjects_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "user_organization_roles_user_id_idx" ON "user_organization_roles"("user_id");

-- CreateIndex
CREATE INDEX "projects_receive_no_idx" ON "projects"("receive_no" DESC);

-- CreateIndex
CREATE INDEX "projects_status_current_workflow_type_idx" ON "projects"("status", "current_workflow_type");

-- CreateIndex
CREATE INDEX "projects_requesting_dept_id_idx" ON "projects"("requesting_dept_id");

-- CreateIndex
CREATE INDEX "project_histories_project_id_idx" ON "project_histories"("project_id");

-- CreateIndex
CREATE INDEX "project_histories_changed_at_idx" ON "project_histories"("changed_at");

-- CreateIndex
CREATE INDEX "project_submissions_project_id_submitted_at_idx" ON "project_submissions"("project_id", "submitted_at" DESC);

-- CreateIndex
CREATE INDEX "project_submissions_project_id_step_order_submission_type_idx" ON "project_submissions"("project_id", "step_order", "submission_type");

-- CreateIndex
CREATE INDEX "_ProcurementProjects_B_index" ON "_ProcurementProjects"("B");

-- CreateIndex
CREATE INDEX "_ContractProjects_B_index" ON "_ContractProjects"("B");

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_dept_id_fkey" FOREIGN KEY ("dept_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_delegations" ADD CONSTRAINT "user_delegations_delegator_id_fkey" FOREIGN KEY ("delegator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_delegations" ADD CONSTRAINT "user_delegations_delegatee_id_fkey" FOREIGN KEY ("delegatee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_organization_roles" ADD CONSTRAINT "user_organization_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_organization_roles" ADD CONSTRAINT "user_organization_roles_dept_id_fkey" FOREIGN KEY ("dept_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_organization_roles" ADD CONSTRAINT "user_organization_roles_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_requesting_dept_id_fkey" FOREIGN KEY ("requesting_dept_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_requesting_unit_id_fkey" FOREIGN KEY ("requesting_unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_responsible_unit_id_fkey" FOREIGN KEY ("responsible_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_cancellations" ADD CONSTRAINT "project_cancellations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_cancellations" ADD CONSTRAINT "project_cancellations_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_cancellations" ADD CONSTRAINT "project_cancellations_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_histories" ADD CONSTRAINT "project_histories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_submissions" ADD CONSTRAINT "project_submissions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_submissions" ADD CONSTRAINT "project_submissions_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_submissions" ADD CONSTRAINT "project_submissions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_submissions" ADD CONSTRAINT "project_submissions_proposing_by_fkey" FOREIGN KEY ("proposing_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_submissions" ADD CONSTRAINT "project_submissions_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "project_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_plans" ADD CONSTRAINT "budget_plans_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_plans" ADD CONSTRAINT "budget_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProcurementProjects" ADD CONSTRAINT "_ProcurementProjects_A_fkey" FOREIGN KEY ("A") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProcurementProjects" ADD CONSTRAINT "_ProcurementProjects_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContractProjects" ADD CONSTRAINT "_ContractProjects_A_fkey" FOREIGN KEY ("A") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContractProjects" ADD CONSTRAINT "_ContractProjects_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
