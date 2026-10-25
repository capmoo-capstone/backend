DROP INDEX "project_contract_numbers_type_contract_no_key";

CREATE INDEX "project_contract_numbers_type_contract_no_idx"
ON "project_contract_numbers"("type", "contract_no");

CREATE UNIQUE INDEX "project_contract_numbers_active_type_contract_no_key"
ON "project_contract_numbers"("type", "contract_no")
WHERE "is_active" = true;
