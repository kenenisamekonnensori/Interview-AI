CREATE TYPE "InterviewStatus" AS ENUM ('DRAFT', 'PREPARING', 'READY', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED');
CREATE TYPE "InterviewType" AS ENUM ('BEHAVIORAL', 'TECHNICAL', 'CODING', 'SYSTEM_DESIGN', 'HR', 'MIXED');
CREATE TYPE "InterviewDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD', 'EXPERT');

CREATE TABLE "interview" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "resumeId" TEXT,
  "jobDescriptionId" TEXT,
  "status" "InterviewStatus" NOT NULL DEFAULT 'DRAFT',
  "interviewType" "InterviewType" NOT NULL,
  "difficulty" "InterviewDifficulty" NOT NULL DEFAULT 'MEDIUM',
  "durationMinutes" INTEGER NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'en',
  "targetRole" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "interview_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "interview_userId_createdAt_idx" ON "interview"("userId", "createdAt");
CREATE INDEX "interview_status_idx" ON "interview"("status");
ALTER TABLE "interview" ADD CONSTRAINT "interview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interview" ADD CONSTRAINT "interview_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "interview" ADD CONSTRAINT "interview_jobDescriptionId_fkey" FOREIGN KEY ("jobDescriptionId") REFERENCES "job_description"("id") ON DELETE SET NULL ON UPDATE CASCADE;
