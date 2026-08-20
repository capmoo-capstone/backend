-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "actual_cost" DECIMAL(18,2),
ALTER COLUMN "budget" DROP NOT NULL;
