-- AlterTable
ALTER TABLE "project_submissions" ALTER COLUMN "submission_round" DROP NOT NULL,
ALTER COLUMN "submission_round" DROP DEFAULT;
