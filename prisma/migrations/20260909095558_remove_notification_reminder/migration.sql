/*
  Warnings:

  - You are about to drop the `notification_reminders` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "notification_reminders" DROP CONSTRAINT "notification_reminders_notification_id_fkey";

-- DropForeignKey
ALTER TABLE "notification_reminders" DROP CONSTRAINT "notification_reminders_project_id_fkey";

-- DropForeignKey
ALTER TABLE "notification_reminders" DROP CONSTRAINT "notification_reminders_user_id_fkey";

-- DropTable
DROP TABLE "notification_reminders";
