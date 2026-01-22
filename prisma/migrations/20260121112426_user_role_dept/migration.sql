/*
  Warnings:

  - You are about to drop the column `delegate_user_id` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `is_delegate` on the `users` table. All the data in the column will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';
ALTER TYPE "UserRole" ADD VALUE 'HEAD_OF_DEPARTMENT';
ALTER TYPE "UserRole" ADD VALUE 'HEAD_OF_UNIT';
ALTER TYPE "UserRole" ADD VALUE 'REPRESENTATIVE';
ALTER TYPE "UserRole" ADD VALUE 'DOCUMENT_STAFF';
ALTER TYPE "UserRole" ADD VALUE 'FINANCE_STAFF';
ALTER TYPE "UserRole" ADD VALUE 'GENERAL_STAFF';

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_delegate_user_id_fkey";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "delegate_user_id",
DROP COLUMN "is_delegate",
ADD COLUMN     "delegated_user_id" TEXT,
ADD COLUMN     "dept_id" TEXT,
ADD COLUMN     "is_delegating" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "allowed_roles" (
    "id" TEXT NOT NULL,
    "dept_id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,

    CONSTRAINT "allowed_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "allowed_roles_dept_id_role_key" ON "allowed_roles"("dept_id", "role");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_delegated_user_id_fkey" FOREIGN KEY ("delegated_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allowed_roles" ADD CONSTRAINT "allowed_roles_dept_id_fkey" FOREIGN KEY ("dept_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
