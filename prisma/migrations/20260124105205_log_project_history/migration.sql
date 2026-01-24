/*
  Warnings:

  - You are about to drop the column `user_id` on the `project_histories` table. All the data in the column will be lost.
  - Changed the type of `action` on the `project_histories` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `old_value` to the `project_histories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `new_value` to the `project_histories` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "LogActionType" AS ENUM ('INFORMATION_UPDATE', 'STATUS_UPDATE', 'ASSIGNEE_UPDATE', 'STEP_UPDATE');

-- AlterTable
ALTER TABLE "project_histories" DROP COLUMN "user_id",
DROP COLUMN "action",
ADD COLUMN     "action" "LogActionType" NOT NULL,
DROP COLUMN "old_value",
ADD COLUMN     "old_value" JSONB NOT NULL,
DROP COLUMN "new_value",
ADD COLUMN     "new_value" JSONB NOT NULL;
