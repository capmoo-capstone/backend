-- AddForeignKey
ALTER TABLE "project_submissions" ADD CONSTRAINT "project_submissions_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
