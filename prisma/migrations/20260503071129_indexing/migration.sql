-- DropIndex
DROP INDEX "project_histories_changed_at_idx";

-- CreateIndex
CREATE INDEX "budget_plans_unit_id_idx" ON "budget_plans"("unit_id");

-- CreateIndex
CREATE INDEX "budget_plans_project_id_idx" ON "budget_plans"("project_id");

-- CreateIndex
CREATE INDEX "project_cancellations_project_id_is_active_idx" ON "project_cancellations"("project_id", "is_active");

-- CreateIndex
CREATE INDEX "project_histories_project_id_action_changed_at_idx" ON "project_histories"("project_id", "action", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "projects_responsible_unit_id_idx" ON "projects"("responsible_unit_id");

-- CreateIndex
CREATE INDEX "projects_created_at_idx" ON "projects"("created_at");

-- CreateIndex
CREATE INDEX "user_delegations_delegatee_id_is_active_idx" ON "user_delegations"("delegatee_id", "is_active");

-- CreateIndex
CREATE INDEX "user_delegations_delegator_id_idx" ON "user_delegations"("delegator_id");

-- CreateIndex
CREATE INDEX "user_organization_roles_dept_id_idx" ON "user_organization_roles"("dept_id");

-- CreateIndex
CREATE INDEX "user_organization_roles_unit_id_idx" ON "user_organization_roles"("unit_id");
