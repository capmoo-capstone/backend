/*
  Warnings:

  - The `required_documents` column on the `workflow_steps` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "workflow_steps" DROP COLUMN "required_documents",
ADD COLUMN     "required_documents" JSONB[];
