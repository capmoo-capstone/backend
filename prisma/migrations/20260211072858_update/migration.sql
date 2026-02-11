/*
  Warnings:

  - The values [PENDING_PROPOSAL,PROPOSING] on the enum `ProjectPhaseStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [SUBMITTED,PENDING_PROPOSAL,PROPOSING] on the enum `SubmissionStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `step_id` on the `project_submissions` table. All the data in the column will be lost.
  - You are about to drop the column `assignee_contract_id` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `assignee_procurement_id` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `contract_status` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `current_step_id` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `current_template_id` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the column `procurement_status` on the `projects` table. All the data in the column will be lost.
  - The `is_urgent` column on the `projects` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `workflow_steps` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `workflow_templates` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `step_order` to the `project_submissions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `workflow_type` to the `project_submissions` table without a default value. This is not possible if the table is not empty.
  - Made the column `submission_round` on table `project_submissions` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `current_workflow_type` to the `projects` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UrgentType" AS ENUM ('NORMAL', 'URGENT', 'VERY_URGENT');

-- AlterEnum
BEGIN;
CREATE TYPE "ProjectPhaseStatus_new" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'WAITING_APPROVAL', 'WAITING_PROPOSAL', 'WAITING_SIGNATURE', 'COMPLETED', 'REJECTED');
ALTER TYPE "ProjectPhaseStatus" RENAME TO "ProjectPhaseStatus_old";
ALTER TYPE "ProjectPhaseStatus_new" RENAME TO "ProjectPhaseStatus";
DROP TYPE "public"."ProjectPhaseStatus_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "SubmissionStatus_new" AS ENUM ('WAITING_APPROVAL', 'WAITING_PROPOSAL', 'WAITING_SIGNATURE', 'COMPLETED', 'REJECTED');
ALTER TABLE "project_submissions" ALTER COLUMN "status" TYPE "SubmissionStatus_new" USING ("status"::text::"SubmissionStatus_new");
ALTER TYPE "SubmissionStatus" RENAME TO "SubmissionStatus_old";
ALTER TYPE "SubmissionStatus_new" RENAME TO "SubmissionStatus";
DROP TYPE "public"."SubmissionStatus_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "project_submissions" DROP CONSTRAINT "project_submissions_step_id_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_assignee_contract_id_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_assignee_procurement_id_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_current_step_id_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_current_template_id_fkey";

-- DropForeignKey
ALTER TABLE "workflow_steps" DROP CONSTRAINT "workflow_steps_template_id_fkey";

-- AlterTable
ALTER TABLE "project_submissions" DROP COLUMN "step_id",
ADD COLUMN     "step_order" INTEGER NOT NULL,
ADD COLUMN     "workflow_type" "UnitResponsibleType" NOT NULL,
ALTER COLUMN "submission_round" SET NOT NULL;

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "assignee_contract_id",
DROP COLUMN "assignee_procurement_id",
DROP COLUMN "contract_status",
DROP COLUMN "current_step_id",
DROP COLUMN "current_template_id",
DROP COLUMN "procurement_status",
ADD COLUMN     "current_workflow_type" "UnitResponsibleType" NOT NULL,
DROP COLUMN "is_urgent",
ADD COLUMN     "is_urgent" "UrgentType" NOT NULL DEFAULT 'NORMAL';

-- DropTable
DROP TABLE "workflow_steps";

-- DropTable
DROP TABLE "workflow_templates";

-- CreateTable
CREATE TABLE "_ProcurementProjects" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProcurementProjects_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ContractProjects" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ContractProjects_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ProcurementProjects_B_index" ON "_ProcurementProjects"("B");

-- CreateIndex
CREATE INDEX "_ContractProjects_B_index" ON "_ContractProjects"("B");

-- AddForeignKey
ALTER TABLE "_ProcurementProjects" ADD CONSTRAINT "_ProcurementProjects_A_fkey" FOREIGN KEY ("A") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProcurementProjects" ADD CONSTRAINT "_ProcurementProjects_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContractProjects" ADD CONSTRAINT "_ContractProjects_A_fkey" FOREIGN KEY ("A") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContractProjects" ADD CONSTRAINT "_ContractProjects_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
