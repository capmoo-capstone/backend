-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'HEAD_OF_DEPARTMENT', 'HEAD_OF_UNIT', 'REPRESENTATIVE', 'DOCUMENT_STAFF', 'FINANCE_STAFF', 'GENERAL_STAFF', 'GUEST');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('UNASSIGNED', 'WAITING_ACCEPT', 'IN_PROGRESS', 'WAITING_CANCEL', 'CANCELLED', 'CLOSED', 'REQUEST_EDIT');

-- CreateEnum
CREATE TYPE "UnitResponsibleType" AS ENUM ('LT100K', 'LT500K', 'MT500K', 'SELECTION', 'EBIDDING', 'CONTRACT');

-- CreateEnum
CREATE TYPE "LogActionType" AS ENUM ('INFORMATION_UPDATE', 'STATUS_UPDATE', 'ASSIGNEE_UPDATE', 'STEP_UPDATE');

-- CreateEnum
CREATE TYPE "ProcurementType" AS ENUM ('LT100K', 'LT500K', 'MT500K', 'SELECTION', 'EBIDDING');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('SUBMITTED', 'WAITING_SIGN', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SubmissionType" AS ENUM ('STAFF', 'VENDOR');

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,

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
    "dept_id" TEXT,
    "unit_id" TEXT,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "full_name" TEXT NOT NULL,
    "role" "UserRole",
    "is_delegating" BOOLEAN NOT NULL DEFAULT false,
    "delegated_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allowed_roles" (
    "id" TEXT NOT NULL,
    "dept_id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,

    CONSTRAINT "allowed_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "receive_no" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "budget" DECIMAL(18,2) NOT NULL,
    "pr_no" TEXT,
    "po_no" TEXT,
    "less_no" TEXT,
    "status" "ProjectStatus" NOT NULL,
    "requesting_unit_id" TEXT,
    "procurement_type" "ProcurementType" NOT NULL,
    "current_template_id" TEXT NOT NULL,
    "current_step_id" TEXT,
    "assignee_procurement_id" TEXT,
    "assignee_contract_id" TEXT,
    "contract_no" TEXT,
    "migo_no" TEXT,
    "vendor_name" TEXT,
    "vendor_tax_id" TEXT,
    "vendor_email" TEXT,
    "is_urgent" BOOLEAN NOT NULL DEFAULT false,
    "expected_approval_date" TIMESTAMP(3),
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
    "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_by" TEXT NOT NULL,
    "cancelled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

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
    "step_id" TEXT,
    "submission_type" "SubmissionType" NOT NULL DEFAULT 'STAFF',
    "submission_round" TEXT,
    "po_no" TEXT,
    "status" "SubmissionStatus" NOT NULL,
    "submitted_by" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action_by" TEXT,
    "action_at" TIMESTAMP(3),
    "comment" TEXT,
    "meta_data" JSONB,

    CONSTRAINT "project_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_documents" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,

    CONSTRAINT "project_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "UnitResponsibleType" NOT NULL,
    "description" TEXT,

    CONSTRAINT "workflow_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_steps" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "required_step" INTEGER[],
    "required_documents" JSONB NOT NULL,

    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "allowed_roles_dept_id_role_key" ON "allowed_roles"("dept_id", "role");

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_dept_id_fkey" FOREIGN KEY ("dept_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_dept_id_fkey" FOREIGN KEY ("dept_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_delegated_user_id_fkey" FOREIGN KEY ("delegated_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allowed_roles" ADD CONSTRAINT "allowed_roles_dept_id_fkey" FOREIGN KEY ("dept_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_current_template_id_fkey" FOREIGN KEY ("current_template_id") REFERENCES "workflow_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_current_step_id_fkey" FOREIGN KEY ("current_step_id") REFERENCES "workflow_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_assignee_procurement_id_fkey" FOREIGN KEY ("assignee_procurement_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_assignee_contract_id_fkey" FOREIGN KEY ("assignee_contract_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_requesting_unit_id_fkey" FOREIGN KEY ("requesting_unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_cancellations" ADD CONSTRAINT "project_cancellations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_histories" ADD CONSTRAINT "project_histories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_submissions" ADD CONSTRAINT "project_submissions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_submissions" ADD CONSTRAINT "project_submissions_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "workflow_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_submissions" ADD CONSTRAINT "project_submissions_action_by_fkey" FOREIGN KEY ("action_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "project_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "workflow_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
