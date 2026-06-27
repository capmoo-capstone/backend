-- Drop stored workflow phase columns. Workflow status is derived from
-- current_workflow_type and the matching *_progress JSON aggregate.
ALTER TABLE "projects"
DROP COLUMN IF EXISTS "contract_phase",
DROP COLUMN IF EXISTS "procurement_phase";
