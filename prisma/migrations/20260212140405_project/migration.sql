/*
  Warnings:

  - You are about to drop the column `cancelled_by` on the `project_cancellations` table. All the data in the column will be lost.
  - Added the required column `requested_by` to the `project_cancellations` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "project_cancellations" DROP COLUMN "cancelled_by",
ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by" TEXT,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "requested_by" TEXT NOT NULL,
ALTER COLUMN "cancelled_at" DROP NOT NULL,
ALTER COLUMN "cancelled_at" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "project_cancellations" ADD CONSTRAINT "project_cancellations_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_cancellations" ADD CONSTRAINT "project_cancellations_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
