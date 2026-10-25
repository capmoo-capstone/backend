-- Vendor emails do not have a user_id, so the existing user-based unique
-- constraint cannot serialize concurrent reservations for the same recipient.
CREATE UNIQUE INDEX "notification_deliveries_recipient_channel_dedupe_key_key"
ON "notification_deliveries"("recipient_email", "channel", "dedupe_key");
