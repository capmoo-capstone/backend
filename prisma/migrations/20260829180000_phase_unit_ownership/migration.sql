-- Store the unit that owns each project phase independently from the mutable
-- current responsible unit. This migration is intentionally not applied by
-- this change; it is for the deployment migration run.

ALTER TABLE "projects"
  ADD COLUMN "procurement_unit_id" TEXT,
  ADD COLUMN "contract_unit_id" TEXT;

-- Projects still in procurement have not moved to another unit, so the
-- current owner is also the procurement owner.
UPDATE "projects"
SET "procurement_unit_id" = "responsible_unit_id"
WHERE "current_workflow_type" <> 'CONTRACT'
  AND "procurement_unit_id" IS NULL;

-- A procurement-to-contract transition records the old responsible unit in
-- project history. Recover it for projects that have already been handed off.
WITH procurement_handoffs AS (
  SELECT DISTINCT ON ("project_id")
    "project_id",
    "old_value" ->> 'responsible_unit_id' AS "procurement_unit_id"
  FROM "project_histories"
  WHERE "new_value" ->> 'current_workflow_type' = 'CONTRACT'
    AND "old_value" ->> 'responsible_unit_id' IS NOT NULL
  ORDER BY "project_id", "changed_at" DESC
)
UPDATE "projects" AS project
SET "procurement_unit_id" = handoff."procurement_unit_id"
FROM procurement_handoffs AS handoff
WHERE project."id" = handoff."project_id"
  AND project."procurement_unit_id" IS NULL;

-- Once a project is in contract, the current responsible unit is the unit
-- that owns its contract phase. Leave pre-contract projects null.
UPDATE "projects"
SET "contract_unit_id" = "responsible_unit_id"
WHERE "current_workflow_type" = 'CONTRACT'
  AND "contract_unit_id" IS NULL;

-- Do not guess ownership for legacy records without a handoff history. The
-- nullable columns keep those records out of phase-owned metrics instead of
-- attributing completed procurement work to the later contract unit.

CREATE INDEX "projects_procurement_unit_id_created_at_idx"
  ON "projects"("procurement_unit_id", "created_at");

CREATE INDEX "projects_contract_unit_id_created_at_idx"
  ON "projects"("contract_unit_id", "created_at");

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_procurement_unit_id_fkey"
  FOREIGN KEY ("procurement_unit_id") REFERENCES "units"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_contract_unit_id_fkey"
  FOREIGN KEY ("contract_unit_id") REFERENCES "units"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
