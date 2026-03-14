/*
  Warnings:

  - You are about to drop the column `code` on the `departments` table. All the data in the column will be lost.
  - Added the required column `requesting_dept_id` to the `projects` table without a default value. This is not possible if the table is not empty.
  - Added the required column `responsible_unit_id` to the `projects` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "ProcurementType" ADD VALUE 'INTERNAL';

-- AlterEnum
ALTER TYPE "UnitResponsibleType" ADD VALUE 'INTERNAL';

-- AlterTable
ALTER TABLE "departments" DROP COLUMN "code";

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "requesting_dept_id" TEXT NOT NULL,
ADD COLUMN     "responsible_unit_id" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_requesting_dept_id_fkey" FOREIGN KEY ("requesting_dept_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_responsible_unit_id_fkey" FOREIGN KEY ("responsible_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
