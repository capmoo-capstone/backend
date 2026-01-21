/*
  Warnings:

  - Changed the type of `type` on the `workflow_templates` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "workflow_templates" DROP COLUMN "type",
ADD COLUMN     "type" "UnitResponsibleType" NOT NULL;
