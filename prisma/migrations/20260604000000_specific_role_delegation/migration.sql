ALTER TABLE "user_delegations"
ADD COLUMN "role" "UserRole",
ADD COLUMN "unit_id" TEXT;

WITH delegable_roles AS (
  SELECT
    "user_id",
    "role",
    "unit_id",
    COUNT(*) OVER (PARTITION BY "user_id") AS role_count
  FROM "user_organization_roles"
  WHERE "dept_id" = 'DEPT-SUP-OPS'
    AND "role" IN ('HEAD_OF_DEPARTMENT', 'HEAD_OF_UNIT')
),
unambiguous_roles AS (
  SELECT "user_id", "role", "unit_id"
  FROM delegable_roles
  WHERE role_count = 1
)
UPDATE "user_delegations" d
SET
  "role" = r."role",
  "unit_id" = r."unit_id"
FROM unambiguous_roles r
WHERE d."delegator_id" = r."user_id";

UPDATE "user_delegations"
SET "is_active" = false
WHERE "is_active" = true
  AND "role" IS NULL;

ALTER TABLE "user_delegations"
ADD CONSTRAINT "user_delegations_active_scope_check"
CHECK (
  "is_active" = false
  OR (
    "role" IN ('HEAD_OF_DEPARTMENT', 'HEAD_OF_UNIT')
    AND (
      ("role" = 'HEAD_OF_DEPARTMENT' AND "unit_id" IS NULL)
      OR ("role" = 'HEAD_OF_UNIT' AND "unit_id" IS NOT NULL)
    )
  )
);

CREATE INDEX "user_delegations_delegatee_active_scope_idx"
ON "user_delegations"("delegatee_id", "is_active", "role", "unit_id");

CREATE INDEX "user_delegations_delegator_active_scope_idx"
ON "user_delegations"("delegator_id", "is_active", "role", "unit_id");
