-- AlterTable
ALTER TABLE "projects"
ADD COLUMN "procurement_started_at" TIMESTAMP(3),
ADD COLUMN "procurement_completed_at" TIMESTAMP(3),
ADD COLUMN "contract_started_at" TIMESTAMP(3),
ADD COLUMN "contract_completed_at" TIMESTAMP(3);

-- Backfill procurement start from WAITING_ACCEPT, falling back to a direct claim.
WITH contract_transitions AS (
  SELECT DISTINCT ON ("project_id")
    "project_id",
    "changed_at" AS "transitioned_at"
  FROM "project_histories"
  WHERE "new_value" ->> 'current_workflow_type' = 'CONTRACT'
  ORDER BY "project_id", "changed_at" ASC
), phase_boundaries AS (
  SELECT
    p."id" AS "project_id",
    ct."transitioned_at",
    COALESCE(
      (
        SELECT h."changed_at"
        FROM "project_histories" h
        WHERE h."project_id" = p."id"
          AND h."changed_at" <= COALESCE(ct."transitioned_at", 'infinity'::timestamp)
          AND h."new_value" ->> 'status' = 'WAITING_ACCEPT'
        ORDER BY h."changed_at" ASC
        LIMIT 1
      ),
      (
        SELECT h."changed_at"
        FROM "project_histories" h
        WHERE h."project_id" = p."id"
          AND h."changed_at" <= COALESCE(ct."transitioned_at", 'infinity'::timestamp)
          AND h."action" = 'ASSIGNEE_UPDATE'
          AND h."new_value" ->> 'status' = 'IN_PROGRESS'
        ORDER BY h."changed_at" ASC
        LIMIT 1
      )
    ) AS "procurement_started_at"
  FROM "projects" p
  LEFT JOIN contract_transitions ct ON ct."project_id" = p."id"
)
UPDATE "projects" p
SET
  "procurement_started_at" = COALESCE(p."procurement_started_at", pb."procurement_started_at"),
  "procurement_completed_at" = COALESCE(p."procurement_completed_at", pb."transitioned_at"),
  "contract_started_at" = COALESCE(p."contract_started_at", pb."transitioned_at")
FROM phase_boundaries pb
WHERE p."id" = pb."project_id";

-- Backfill contract completion when every configured installment has an export record.
WITH completed_contracts AS (
  SELECT
    pfe."project_id",
    MAX(pfe."created_at") AS "contract_completed_at"
  FROM "project_finance_exports" pfe
  INNER JOIN "projects" p ON p."id" = pfe."project_id"
  GROUP BY pfe."project_id", p."installment_rounds"
  HAVING COUNT(*) = p."installment_rounds"
)
UPDATE "projects" p
SET "contract_completed_at" = COALESCE(
  p."contract_completed_at",
  cc."contract_completed_at"
)
FROM completed_contracts cc
WHERE p."id" = cc."project_id";

-- CreateIndex
CREATE INDEX "projects_procurement_completed_at_idx"
ON "projects"("procurement_completed_at");

-- CreateIndex
CREATE INDEX "projects_contract_completed_at_idx"
ON "projects"("contract_completed_at");
