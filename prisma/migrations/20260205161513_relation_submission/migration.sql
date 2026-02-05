-- AddForeignKey
ALTER TABLE "project_submissions" ADD CONSTRAINT "project_submissions_proposing_by_fkey" FOREIGN KEY ("proposing_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_submissions" ADD CONSTRAINT "project_submissions_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
