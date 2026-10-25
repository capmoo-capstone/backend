/*
  Warnings:

  - Added the required column `recipient_email` to the `notification_deliveries` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationDeliveryStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "NotificationDeliveryStatus" ADD VALUE 'BOUNCED';
ALTER TYPE "NotificationDeliveryStatus" ADD VALUE 'COMPLAINED';

-- AlterTable
ALTER TABLE "notification_deliveries" ADD COLUMN     "bounced_at" TIMESTAMP(3),
ADD COLUMN     "delivered_at" TIMESTAMP(3),
ADD COLUMN     "email_type" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "provider_message_id" TEXT,
ADD COLUMN     "recipient_email" TEXT NOT NULL,
ALTER COLUMN "user_id" DROP NOT NULL,
ALTER COLUMN "channel" SET DEFAULT 'EMAIL_IMMEDIATE';

-- CreateIndex
CREATE INDEX "notification_deliveries_recipient_email_idx" ON "notification_deliveries"("recipient_email");

-- CreateIndex
CREATE INDEX "notification_deliveries_provider_message_id_idx" ON "notification_deliveries"("provider_message_id");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_created_at_idx" ON "notification_deliveries"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notification_deliveries_email_type_created_at_idx" ON "notification_deliveries"("email_type", "created_at" DESC);
