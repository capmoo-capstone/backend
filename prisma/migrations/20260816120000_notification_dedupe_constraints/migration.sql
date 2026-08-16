DROP INDEX IF EXISTS "notifications_dedupe_key_idx";
DROP INDEX IF EXISTS "notification_deliveries_dedupe_key_idx";

CREATE UNIQUE INDEX "notifications_user_id_dedupe_key_key"
ON "notifications"("user_id", "dedupe_key")
WHERE "dedupe_key" IS NOT NULL;

CREATE UNIQUE INDEX "notification_deliveries_user_id_channel_dedupe_key_key"
ON "notification_deliveries"("user_id", "channel", "dedupe_key")
WHERE "dedupe_key" IS NOT NULL;
