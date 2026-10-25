-- Extend the existing notification delivery record for Resend correlation.
ALTER TYPE "NotificationDeliveryStatus" ADD VALUE 'DELAYED';
ALTER TYPE "NotificationDeliveryStatus" ADD VALUE 'SUPPRESSED';

ALTER TABLE "notification_deliveries"
ADD COLUMN "submission_id" TEXT,
ADD COLUMN "status_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "latest_svix_event_id" TEXT;

CREATE INDEX "notification_deliveries_submission_id_idx"
ON "notification_deliveries"("submission_id");

ALTER TABLE "notification_deliveries"
ADD CONSTRAINT "notification_deliveries_submission_id_fkey"
FOREIGN KEY ("submission_id") REFERENCES "project_submissions"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
