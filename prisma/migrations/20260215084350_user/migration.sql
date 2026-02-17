/*
  Warnings:

  - You are about to drop the column `departmentId` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `unitId` on the `users` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_unitId_fkey";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "departmentId",
DROP COLUMN "unitId";
