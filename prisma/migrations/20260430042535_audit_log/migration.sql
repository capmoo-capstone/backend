/*
  Warnings:

  - You are about to drop the column `updated_at` on the `user_delegations` table. All the data in the column will be lost.
  - Changed the type of `action` on the `project_histories` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `created_by` to the `user_delegations` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AuditLogType" AS ENUM ('PROJECT_HISTORY', 'PROJECT_CANCELLATION', 'USER_DELEGATION');

-- CreateEnum
CREATE TYPE "ProjectActionType" AS ENUM ('INFORMATION_UPDATE', 'STATUS_UPDATE', 'ASSIGNEE_UPDATE', 'STEP_UPDATE');

-- AlterTable
ALTER TABLE "project_histories" DROP COLUMN "action",
ADD COLUMN     "action" "ProjectActionType" NOT NULL;

-- AlterTable
ALTER TABLE "user_delegations" DROP COLUMN "updated_at",
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "cancelled_by" TEXT,
ADD COLUMN     "created_by" TEXT NOT NULL;

-- DropEnum
DROP TYPE "LogActionType";

-- AddForeignKey
ALTER TABLE "user_delegations" ADD CONSTRAINT "user_delegations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_delegations" ADD CONSTRAINT "user_delegations_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
