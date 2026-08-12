-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('SSO', 'STANDARD');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEventType" ADD VALUE 'REGISTRATION_REQUESTED';
ALTER TYPE "AuditEventType" ADD VALUE 'REGISTRATION_APPROVED';
ALTER TYPE "AuditEventType" ADD VALUE 'REGISTRATION_REJECTED';
ALTER TYPE "AuditEventType" ADD VALUE 'STANDARD_ACCOUNT_CREATED';

-- AlterEnum
ALTER TYPE "AuditTargetType" ADD VALUE 'REGISTRATION_REQUEST';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "register_type" "UserType" NOT NULL DEFAULT 'STANDARD',
ALTER COLUMN "password" DROP NOT NULL;

-- CreateTable
CREATE TABLE "registration_requests" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "dept_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "register_type" "UserType" NOT NULL DEFAULT 'SSO',
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registration_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registration_requests_created_user_id_key" ON "registration_requests"("created_user_id");

-- CreateIndex
CREATE INDEX "registration_requests_status_created_at_idx" ON "registration_requests"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "registration_requests_username_idx" ON "registration_requests"("username");

-- CreateIndex
CREATE INDEX "registration_requests_email_idx" ON "registration_requests"("email");

-- AddForeignKey
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_dept_id_fkey" FOREIGN KEY ("dept_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
