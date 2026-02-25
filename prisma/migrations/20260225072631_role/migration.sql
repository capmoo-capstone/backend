/*
  Warnings:

  - You are about to drop the column `role_id` on the `user_organization_roles` table. All the data in the column will be lost.
  - You are about to drop the `user_roles` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `role` to the `user_organization_roles` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'HEAD_OF_DEPARTMENT', 'HEAD_OF_UNIT', 'REPRESENTATIVE', 'DOCUMENT_STAFF', 'FINANCE_STAFF', 'GENERAL_STAFF', 'GUEST');

-- DropForeignKey
ALTER TABLE "user_organization_roles" DROP CONSTRAINT "user_organization_roles_role_id_fkey";

-- AlterTable
ALTER TABLE "user_organization_roles" DROP COLUMN "role_id",
ADD COLUMN     "role" "UserRole" NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DropTable
DROP TABLE "user_roles";

-- DropEnum
DROP TYPE "Role";
