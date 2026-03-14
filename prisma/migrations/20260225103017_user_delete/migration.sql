-- DropForeignKey
ALTER TABLE "user_organization_roles" DROP CONSTRAINT "user_organization_roles_user_id_fkey";

-- AddForeignKey
ALTER TABLE "user_organization_roles" ADD CONSTRAINT "user_organization_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
