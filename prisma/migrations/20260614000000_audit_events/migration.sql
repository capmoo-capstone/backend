-- Add append-only audit events and explicit cancellation decision state.

CREATE TYPE "AuditEventType" AS ENUM (
  'PROJECT_DATA_UPDATED',
  'PROJECT_ASSIGNEE_UPDATED',
  'PROJECT_STATUS_UPDATED',
  'PROJECT_STEP_UPDATED',
  'USER_DELEGATION_CREATED',
  'USER_DELEGATION_CANCELLED',
  'PROJECT_CANCELLATION_CREATED',
  'PROJECT_CANCELLATION_APPROVED',
  'PROJECT_CANCELLATION_REJECTED'
);

CREATE TYPE "AuditTargetType" AS ENUM (
  'PROJECT',
  'USER_DELEGATION',
  'PROJECT_CANCELLATION'
);

CREATE TYPE "ProjectCancellationStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED'
);

ALTER TABLE "project_cancellations"
ADD COLUMN "status" "ProjectCancellationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "decision_by" TEXT,
ADD COLUMN "decision_at" TIMESTAMP(3),
ADD COLUMN "decision_comment" TEXT;

UPDATE "project_cancellations"
SET
  "status" = 'APPROVED',
  "decision_by" = "approved_by",
  "decision_at" = COALESCE("approved_at", "cancelled_at", "requested_at"),
  "decision_comment" = "reason"
WHERE "is_cancelled" = true;

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

CREATE UNIQUE INDEX "audit_events_source_table_source_id_event_type_key"
ON "audit_events"("source_table", "source_id", "event_type");

CREATE INDEX "audit_events_occurred_at_idx"
ON "audit_events"("occurred_at" DESC);

CREATE INDEX "audit_events_kind_occurred_at_idx"
ON "audit_events"("kind", "occurred_at" DESC);

CREATE INDEX "audit_events_event_type_occurred_at_idx"
ON "audit_events"("event_type", "occurred_at" DESC);

CREATE INDEX "audit_events_project_id_occurred_at_idx"
ON "audit_events"("project_id", "occurred_at" DESC);

CREATE INDEX "audit_events_actor_id_occurred_at_idx"
ON "audit_events"("actor_id", "occurred_at" DESC);
