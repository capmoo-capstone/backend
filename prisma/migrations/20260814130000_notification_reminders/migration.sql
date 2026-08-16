CREATE TABLE "notification_reminders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "notification_id" TEXT,
    "target_key" TEXT NOT NULL,
    "window_key" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_reminders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_reminders_user_id_project_id_target_key_window_key_scheduled_for_key"
ON "notification_reminders"("user_id", "project_id", "target_key", "window_key", "scheduled_for");

CREATE INDEX "notification_reminders_user_id_sent_at_scheduled_for_idx"
ON "notification_reminders"("user_id", "sent_at", "scheduled_for" DESC);

CREATE INDEX "notification_reminders_project_id_target_key_scheduled_for_idx"
ON "notification_reminders"("project_id", "target_key", "scheduled_for" DESC);

ALTER TABLE "notification_reminders"
ADD CONSTRAINT "notification_reminders_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_reminders"
ADD CONSTRAINT "notification_reminders_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_reminders"
ADD CONSTRAINT "notification_reminders_notification_id_fkey"
FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
