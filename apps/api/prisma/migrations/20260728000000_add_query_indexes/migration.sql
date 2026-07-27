-- Additive indexes for existing owner-scoped visible-resource lists and completed-interview analytics.
-- Review index-build impact on large production tables before release; Prisma migrations use standard CREATE INDEX.
CREATE INDEX "resume_userId_deletedAt_isActive_createdAt_idx"
  ON "resume"("userId", "deletedAt", "isActive", "createdAt");

CREATE INDEX "job_description_userId_deletedAt_createdAt_idx"
  ON "job_description"("userId", "deletedAt", "createdAt");

CREATE INDEX "interview_userId_status_completedAt_idx"
  ON "interview"("userId", "status", "completedAt");
