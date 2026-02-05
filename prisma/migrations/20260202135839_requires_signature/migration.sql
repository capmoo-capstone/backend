-- AlterTable
ALTER TABLE "project_submissions" ADD COLUMN     "signed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "workflow_steps" ADD COLUMN     "requires_signature" BOOLEAN NOT NULL DEFAULT false;
