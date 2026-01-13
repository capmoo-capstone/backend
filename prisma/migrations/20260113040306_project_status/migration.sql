/*
  Warnings:

  - The values [PENDING] on the enum `ProjectStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ProjectStatus_new" AS ENUM ('DRAFT', 'WAITING_TO_BE_ASSIGNED', 'WAITING_FOR_ACCEPTANCE', 'IN_PROGRESS_OF_PROCUREMENT', 'IN_PROGRESS_OF_CONTRACT', 'APPROVED', 'REJECTED');
ALTER TABLE "projects" ALTER COLUMN "status" TYPE "ProjectStatus_new" USING ("status"::text::"ProjectStatus_new");
ALTER TYPE "ProjectStatus" RENAME TO "ProjectStatus_old";
ALTER TYPE "ProjectStatus_new" RENAME TO "ProjectStatus";
DROP TYPE "public"."ProjectStatus_old";
COMMIT;
