-- 1. Ensure pgcrypto extension exists for gen_random_uuid() (safe for PG < 13)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Safely add REVIEW_TOR enum value (idempotent)
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'REVIEW_TOR';

-- 3. Backfill Step 0 completed submissions for existing active/completed projects only
INSERT INTO "project_submissions" (
    "id",
    "project_id",
    "workflow_type",
    "step_order",
    "submission_type",
    "submission_round",
    "status",
    "submitted_by",
    "submitted_at",
    "approved_by",
    "approved_at",
    "completed_by",
    "completed_at",
    "meta_data"
)
SELECT
    gen_random_uuid()::text,
    p."id",
    COALESCE(p."procurement_type"::text, p."current_workflow_type"::text)::"UnitResponsibleType",
    0,
    'STAFF'::"SubmissionType",
    1,
    'COMPLETED'::"SubmissionStatus",
    p."created_by",
    COALESCE(p."procurement_started_at", p."created_at"),
    p."created_by",
    COALESCE(p."procurement_started_at", p."created_at"),
    p."created_by",
    COALESCE(p."procurement_started_at", p."created_at"),
    ARRAY[]::jsonb[]
FROM "projects" p
WHERE 
    -- For procurement phase: exclude projects that haven't been claimed/assigned yet
    -- For contract phase (or completed procurement): procurement step 0 was already completed
    (
        p."current_workflow_type" = 'CONTRACT'
        OR p."procurement_completed_at" IS NOT NULL
        OR p."status" NOT IN ('UNASSIGNED', 'WAITING_ACCEPT')
    )
    -- Idempotency check: ensure no step 0 already exists for this project
    AND NOT EXISTS (
        SELECT 1
        FROM "project_submissions" ps
        WHERE ps."project_id" = p."id"
          AND ps."step_order" = 0
    );

