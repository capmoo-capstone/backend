/*
  Warnings:

  - You are about to drop the column `vendor_tax_id` on the `projects` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "projects" DROP COLUMN "vendor_tax_id",
ADD COLUMN     "asset_code" BOOLEAN;
