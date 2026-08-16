-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'HEAD_OF_DEPARTMENT', 'HEAD_OF_UNIT', 'REPRESENTATIVE', 'DOCUMENT_STAFF', 'FINANCE_STAFF', 'GENERAL_STAFF', 'GUEST');

-- CreateEnum
CREATE TYPE "RegisterType" AS ENUM ('SSO', 'STANDARD');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('UNASSIGNED', 'WAITING_ACCEPT', 'IN_PROGRESS', 'WAITING_CANCEL', 'WAITING_CLOSE', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProjectInstallmentStatus" AS ENUM ('WAITING_EXPORT', 'EXPORTED', 'REQUEST_EDIT');

-- CreateEnum
CREATE TYPE "UnitResponsibleType" AS ENUM ('LT100K', 'LT500K', 'MT500K', 'SELECTION', 'EBIDDING', 'INTERNAL', 'CONTRACT');

-- CreateEnum
CREATE TYPE "AuditLogType" AS ENUM ('PROJECT_HISTORY', 'PROJECT_CANCELLATION', 'USER_DELEGATION', 'CONTRACT_NUMBER', 'USER_MANAGEMENT');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('PROJECT_DATA_UPDATED', 'PROJECT_ASSIGNEE_UPDATED', 'PROJECT_STATUS_UPDATED', 'PROJECT_STEP_UPDATED', 'USER_DELEGATION_CREATED', 'USER_DELEGATION_CANCELLED', 'PROJECT_CANCELLATION_CREATED', 'PROJECT_CANCELLATION_APPROVED', 'PROJECT_CANCELLATION_REJECTED', 'CONTRACT_NUMBER_CREATED', 'CONTRACT_NUMBER_CANCELLED', 'USER_ROLE_ASSIGNED', 'USER_ROLE_REMOVED', 'UNIT_STAFF_ADDED', 'UNIT_STAFF_REMOVED', 'REGISTRATION_REQUESTED', 'REGISTRATION_APPROVED', 'REGISTRATION_REJECTED', 'USER_CREATED', 'USER_STATUS_UPDATED');

-- CreateEnum
CREATE TYPE "AuditTargetType" AS ENUM ('PROJECT', 'USER_DELEGATION', 'PROJECT_CANCELLATION', 'CONTRACT_NUMBER', 'USER', 'REGISTRATION_REQUEST');

-- CreateEnum
CREATE TYPE "ProjectActionType" AS ENUM ('INFORMATION_UPDATE', 'STATUS_UPDATE', 'ASSIGNEE_UPDATE', 'STEP_UPDATE');

-- CreateEnum
CREATE TYPE "ProjectCancellationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProcurementType" AS ENUM ('LT100K', 'LT500K', 'MT500K', 'SELECTION', 'EBIDDING', 'INTERNAL');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('WAITING_APPROVAL', 'WAITING_PROPOSAL', 'WAITING_SIGNATURE', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProjectPhaseStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'WAITING_APPROVAL', 'WAITING_PROPOSAL', 'WAITING_SIGNATURE', 'NOT_EXPORTED', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SubmissionType" AS ENUM ('STAFF', 'VENDOR');

-- CreateEnum
CREATE TYPE "UrgentType" AS ENUM ('NORMAL', 'URGENT', 'VERY_URGENT', 'SUPER_URGENT');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('ASSIGNMENTS', 'APPROVALS', 'DEADLINES', 'WORKFLOW_UPDATES', 'CANCELLATIONS', 'DELEGATION', 'VENDOR_SUBMISSIONS', 'FINANCE_HANDOFFS', 'SYSTEM_ACCOUNT');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL_IMMEDIATE', 'EMAIL_DIGEST');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED');

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
    "budget_code" TEXT,
    "type" "UnitResponsibleType"[],

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "password" TEXT,
    "register_type" "RegisterType"[] DEFAULT ARRAY['STANDARD']::"RegisterType"[],
    "full_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registration_requests" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "dept_id" TEXT NOT NULL,
    "unit_id" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "register_type" "RegisterType"[] DEFAULT ARRAY['SSO']::"RegisterType"[],
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registration_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saml_request_cache" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saml_request_cache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "saml_response_replays" (
    "response_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saml_response_replays_pkey" PRIMARY KEY ("response_hash")
);

-- CreateTable
CREATE TABLE "user_delegations" (
    "id" TEXT NOT NULL,
    "delegator_id" TEXT NOT NULL,
    "delegatee_id" TEXT NOT NULL,
    "role" "UserRole",
    "unit_id" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" TEXT,

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
    "installment_rounds" INTEGER NOT NULL DEFAULT 1,
    "procurement_started_at" TIMESTAMP(3),
    "procurement_completed_at" TIMESTAMP(3),
    "contract_started_at" TIMESTAMP(3),
    "contract_completed_at" TIMESTAMP(3),
    "procurement_progress" JSONB NOT NULL DEFAULT '{"GENERAL_STAFF":{"status":"NOT_STARTED","step":null},"HEAD_OF_UNIT":{"status":"NOT_STARTED","step":null},"DOCUMENT_STAFF":{"status":"NOT_STARTED","step":null}}',
    "contract_progress" JSONB NOT NULL DEFAULT '{"GENERAL_STAFF":{"status":"NOT_STARTED","step":null},"HEAD_OF_UNIT":{"status":"NOT_STARTED","step":null},"DOCUMENT_STAFF":{"status":"NOT_STARTED","step":null}}',
    "pr_no" TEXT,
    "po_no" TEXT,
    "less_no" TEXT,
    "migo_103_no" TEXT,
    "migo_105_no" TEXT,
    "contract_no_id" TEXT,
    "asset_code" BOOLEAN,
    "vendor_name" TEXT,
    "vendor_email" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "actor_id" TEXT,
    "category" "NotificationCategory" NOT NULL,
    "priority" "NotificationPriority" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "target_path" TEXT,
    "action_label" TEXT,
    "requires_action" BOOLEAN NOT NULL DEFAULT false,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "dedupe_key" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT,
    "user_id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "dedupe_key" TEXT,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_reminders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "notification_id" TEXT,
    "target_key" TEXT NOT NULL,
    "window_key" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_outbox" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "unread_count" INTEGER NOT NULL,
    "status" "NotificationOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempted_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_contract_numbers" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "contract_no" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "project_contract_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_cancellations" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ProjectCancellationStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decision_by" TEXT,
    "decision_at" TIMESTAMP(3),

    CONSTRAINT "project_cancellations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_histories" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "action" "ProjectActionType" NOT NULL,
    "old_value" JSONB NOT NULL,
    "new_value" JSONB NOT NULL,
    "comment" TEXT,
    "changed_by" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "kind" "AuditLogType" NOT NULL,
    "event_type" "AuditEventType" NOT NULL,
    "target_type" "AuditTargetType" NOT NULL,
    "target_id" TEXT NOT NULL,
    "project_id" TEXT,
    "actor_id" TEXT,
    "actor_snapshot" JSONB NOT NULL,
    "target_snapshot" JSONB NOT NULL,
    "diff" JSONB,
    "comment" TEXT,
    "metadata" JSONB,
    "search_text" TEXT,
    "source_table" TEXT,
    "source_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_submissions" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "workflow_type" "UnitResponsibleType" NOT NULL,
    "step_order" INTEGER NOT NULL,
    "submission_type" "SubmissionType" NOT NULL DEFAULT 'STAFF',
    "submission_round" INTEGER NOT NULL,
    "installment_no" INTEGER,
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
    "staff_remark" TEXT,
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
    "budget_year" INTEGER NOT NULL,
    "unit_id" TEXT NOT NULL,
    "activity_type" INTEGER NOT NULL,
    "activity_type_name" TEXT NOT NULL,
    "description" TEXT,
    "budget_name" TEXT,
    "budget_amount" DECIMAL(18,2) NOT NULL,
    "project_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "budget_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "registration_requests_created_user_id_key" ON "registration_requests"("created_user_id");

-- CreateIndex
CREATE INDEX "registration_requests_status_created_at_idx" ON "registration_requests"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "registration_requests_username_idx" ON "registration_requests"("username");

-- CreateIndex
CREATE INDEX "registration_requests_email_idx" ON "registration_requests"("email");

-- CreateIndex
CREATE INDEX "saml_request_cache_expires_at_idx" ON "saml_request_cache"("expires_at");

-- CreateIndex
CREATE INDEX "saml_response_replays_expires_at_idx" ON "saml_response_replays"("expires_at");

-- CreateIndex
CREATE INDEX "user_delegations_delegatee_id_is_active_idx" ON "user_delegations"("delegatee_id", "is_active");

-- CreateIndex
CREATE INDEX "user_delegations_delegatee_active_scope_idx" ON "user_delegations"("delegatee_id", "is_active", "role", "unit_id");

-- CreateIndex
CREATE INDEX "user_delegations_delegator_id_idx" ON "user_delegations"("delegator_id");

-- CreateIndex
CREATE INDEX "user_delegations_delegator_active_scope_idx" ON "user_delegations"("delegator_id", "is_active", "role", "unit_id");

-- CreateIndex
CREATE INDEX "user_organization_roles_dept_id_idx" ON "user_organization_roles"("dept_id");

-- CreateIndex
CREATE INDEX "user_organization_roles_unit_id_idx" ON "user_organization_roles"("unit_id");

-- CreateIndex
CREATE INDEX "user_organization_roles_user_id_idx" ON "user_organization_roles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_contract_no_id_key" ON "projects"("contract_no_id");

-- CreateIndex
CREATE INDEX "projects_receive_no_idx" ON "projects"("receive_no" DESC);

-- CreateIndex
CREATE INDEX "projects_status_current_workflow_type_idx" ON "projects"("status", "current_workflow_type");

-- CreateIndex
CREATE INDEX "projects_requesting_dept_id_idx" ON "projects"("requesting_dept_id");

-- CreateIndex
CREATE INDEX "projects_responsible_unit_id_idx" ON "projects"("responsible_unit_id");

-- CreateIndex
CREATE INDEX "projects_created_at_idx" ON "projects"("created_at");

-- CreateIndex
CREATE INDEX "projects_procurement_completed_at_idx" ON "projects"("procurement_completed_at");

-- CreateIndex
CREATE INDEX "projects_contract_completed_at_idx" ON "projects"("contract_completed_at");

-- CreateIndex
CREATE INDEX "project_installments_status_idx" ON "project_installments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "project_installments_project_id_installment_no_key" ON "project_installments"("project_id", "installment_no");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_user_id_category_created_at_idx" ON "notifications"("user_id", "category", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_project_id_created_at_idx" ON "notifications"("project_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_dedupe_key_key" ON "notifications"("user_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "notification_deliveries_user_id_channel_status_created_at_idx" ON "notification_deliveries"("user_id", "channel", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notification_deliveries_notification_id_idx" ON "notification_deliveries"("notification_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_user_id_channel_dedupe_key_key" ON "notification_deliveries"("user_id", "channel", "dedupe_key");

-- CreateIndex
CREATE INDEX "notification_reminders_user_id_sent_at_scheduled_for_idx" ON "notification_reminders"("user_id", "sent_at", "scheduled_for" DESC);

-- CreateIndex
CREATE INDEX "notification_reminders_project_id_target_key_scheduled_for_idx" ON "notification_reminders"("project_id", "target_key", "scheduled_for" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notification_reminders_user_id_project_id_target_key_window_key" ON "notification_reminders"("user_id", "project_id", "target_key", "window_key", "scheduled_for");

-- CreateIndex
CREATE INDEX "notification_outbox_notification_id_idx" ON "notification_outbox"("notification_id");

-- CreateIndex
CREATE INDEX "notification_outbox_status_created_at_idx" ON "notification_outbox"("status", "created_at" ASC);

-- CreateIndex
CREATE INDEX "notification_outbox_user_id_status_created_at_idx" ON "notification_outbox"("user_id", "status", "created_at" ASC);

-- CreateIndex
CREATE INDEX "project_contract_numbers_is_active_idx" ON "project_contract_numbers"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "project_contract_numbers_type_contract_no_key" ON "project_contract_numbers"("type", "contract_no");

-- CreateIndex
CREATE INDEX "project_cancellations_project_id_idx" ON "project_cancellations"("project_id");

-- CreateIndex
CREATE INDEX "project_histories_project_id_idx" ON "project_histories"("project_id");

-- CreateIndex
CREATE INDEX "project_histories_project_id_action_changed_at_idx" ON "project_histories"("project_id", "action", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_occurred_at_idx" ON "audit_events"("occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_kind_occurred_at_idx" ON "audit_events"("kind", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_event_type_occurred_at_idx" ON "audit_events"("event_type", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_project_id_occurred_at_idx" ON "audit_events"("project_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_actor_id_occurred_at_idx" ON "audit_events"("actor_id", "occurred_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_source_table_source_id_event_type_key" ON "audit_events"("source_table", "source_id", "event_type");

-- CreateIndex
CREATE INDEX "project_submissions_project_id_submitted_at_idx" ON "project_submissions"("project_id", "submitted_at" DESC);

-- CreateIndex
CREATE INDEX "project_submissions_project_id_step_order_submission_type_idx" ON "project_submissions"("project_id", "step_order", "submission_type");

-- CreateIndex
CREATE INDEX "project_submissions_project_id_workflow_type_installment_no_idx" ON "project_submissions"("project_id", "workflow_type", "installment_no", "step_order", "submission_type");

-- CreateIndex
CREATE INDEX "budget_plans_unit_id_idx" ON "budget_plans"("unit_id");

-- CreateIndex
CREATE INDEX "budget_plans_project_id_idx" ON "budget_plans"("project_id");

-- CreateIndex
CREATE INDEX "holidays_date_idx" ON "holidays"("date");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_date_key" ON "holidays"("date");

-- CreateIndex
CREATE INDEX "_ProcurementProjects_B_index" ON "_ProcurementProjects"("B");

-- CreateIndex
CREATE INDEX "_ContractProjects_B_index" ON "_ContractProjects"("B");

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_dept_id_fkey" FOREIGN KEY ("dept_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_dept_id_fkey" FOREIGN KEY ("dept_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_delegations" ADD CONSTRAINT "user_delegations_delegator_id_fkey" FOREIGN KEY ("delegator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_delegations" ADD CONSTRAINT "user_delegations_delegatee_id_fkey" FOREIGN KEY ("delegatee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_delegations" ADD CONSTRAINT "user_delegations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_delegations" ADD CONSTRAINT "user_delegations_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "projects" ADD CONSTRAINT "projects_contract_no_id_fkey" FOREIGN KEY ("contract_no_id") REFERENCES "project_contract_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_installments" ADD CONSTRAINT "project_installments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_installments" ADD CONSTRAINT "project_installments_exported_by_fkey" FOREIGN KEY ("exported_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_installments" ADD CONSTRAINT "project_installments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_reminders" ADD CONSTRAINT "notification_reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_reminders" ADD CONSTRAINT "notification_reminders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_reminders" ADD CONSTRAINT "notification_reminders_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_cancellations" ADD CONSTRAINT "project_cancellations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_cancellations" ADD CONSTRAINT "project_cancellations_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_cancellations" ADD CONSTRAINT "project_cancellations_decision_by_fkey" FOREIGN KEY ("decision_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
