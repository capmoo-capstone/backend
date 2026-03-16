-- DropForeignKey
ALTER TABLE "budget_plans" DROP CONSTRAINT "budget_plans_department_id_fkey";

-- AddForeignKey
ALTER TABLE "budget_plans" ADD CONSTRAINT "budget_plans_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
