/*
  Warnings:

  - You are about to drop the column `delegated_user_id` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `dept_id` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `is_delegating` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `unit_id` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `allowed_roles` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'HEAD_OF_DEPARTMENT', 'HEAD_OF_UNIT', 'REPRESENTATIVE', 'DOCUMENT_STAFF', 'FINANCE_STAFF', 'GENERAL_STAFF', 'GUEST');

-- DropForeignKey
ALTER TABLE "allowed_roles" DROP CONSTRAINT "allowed_roles_dept_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_delegated_user_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_dept_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_unit_id_fkey";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "delegated_user_id",
DROP COLUMN "dept_id",
DROP COLUMN "is_delegating",
DROP COLUMN "role",
DROP COLUMN "unit_id",
ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "unitId" TEXT;

-- DropTable
DROP TABLE "allowed_roles";

-- DropEnum
DROP TYPE "UserRole";

-- CreateTable
CREATE TABLE "user_delegations" (
    "id" TEXT NOT NULL,
    "delegator_id" TEXT NOT NULL,
    "delegatee_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "user_delegations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "name" "Role" NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_organization_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "dept_id" TEXT NOT NULL,
    "unit_id" TEXT,

    CONSTRAINT "user_organization_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_name_key" ON "user_roles"("name");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_delegations" ADD CONSTRAINT "user_delegations_delegator_id_fkey" FOREIGN KEY ("delegator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_delegations" ADD CONSTRAINT "user_delegations_delegatee_id_fkey" FOREIGN KEY ("delegatee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_organization_roles" ADD CONSTRAINT "user_organization_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_organization_roles" ADD CONSTRAINT "user_organization_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "user_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_organization_roles" ADD CONSTRAINT "user_organization_roles_dept_id_fkey" FOREIGN KEY ("dept_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_organization_roles" ADD CONSTRAINT "user_organization_roles_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
