-- Stage 2: Target jobs / career targets.
-- A CareerTarget is the durable "job I am preparing for" entity. It links to an
-- optional saved JobDescription and an optional Resume instead of duplicating
-- their text. Historical interviews keep their target reference because targets
-- are soft-deleted (ARCHIVED) and never hard-deleted while referenced.
CREATE TYPE "CareerTargetStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "career_target" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "company" TEXT,
  "jobDescriptionId" TEXT,
  "jobUrl" TEXT,
  "location" TEXT,
  "resumeId" TEXT,
  "status" "CareerTargetStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "career_target_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "career_target_userId_status_createdAt_idx" ON "career_target"("userId", "status", "createdAt");

ALTER TABLE "career_target" ADD CONSTRAINT "career_target_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "career_target" ADD CONSTRAINT "career_target_jobDescriptionId_fkey" FOREIGN KEY ("jobDescriptionId") REFERENCES "job_description"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "career_target" ADD CONSTRAINT "career_target_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Smallest change to associate interviews with a target. Nullable so existing
-- interviews and target-less users are unaffected; SetNull preserves history.
ALTER TABLE "interview" ADD COLUMN "careerTargetId" TEXT;
ALTER TABLE "interview" ADD CONSTRAINT "interview_careerTargetId_fkey" FOREIGN KEY ("careerTargetId") REFERENCES "career_target"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "interview_userId_careerTargetId_idx" ON "interview"("userId", "careerTargetId");
