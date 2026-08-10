/*
  Warnings:

  - The `register_type` column on the `registration_requests` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `register_type` column on the `users` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "RegisterType" AS ENUM ('SSO', 'STANDARD');

-- AlterTable
ALTER TABLE "registration_requests" DROP COLUMN "register_type",
ADD COLUMN     "register_type" "RegisterType" NOT NULL DEFAULT 'SSO';

-- AlterTable
ALTER TABLE "users" DROP COLUMN "register_type",
ADD COLUMN     "register_type" "RegisterType" NOT NULL DEFAULT 'STANDARD';

-- DropEnum
DROP TYPE "UserType";
