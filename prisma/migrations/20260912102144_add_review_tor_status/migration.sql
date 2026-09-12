-- AlterEnum
ALTER TYPE "ProjectStatus" ADD VALUE 'REVIEW_TOR';

-- Create step 0 completed submissions for all existing projects
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
    p."procurement_type"::text::"UnitResponsibleType",
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
WHERE NOT EXISTS (
    SELECT 1
    FROM "project_submissions" ps
    WHERE ps."project_id" = p."id"
      AND ps."step_order" = 0
);
