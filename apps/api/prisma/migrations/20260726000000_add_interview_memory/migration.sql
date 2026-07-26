CREATE TABLE "interview_memory" (
  "id" TEXT NOT NULL,
  "interviewId" TEXT NOT NULL,
  "askedQuestions" JSONB NOT NULL DEFAULT '[]',
  "topicCoverage" JSONB NOT NULL DEFAULT '[]',
  "candidateStrengths" JSONB NOT NULL DEFAULT '[]',
  "weakAreas" JSONB NOT NULL DEFAULT '[]',
  "missedFollowUps" JSONB NOT NULL DEFAULT '[]',
  "questionDifficulty" "InterviewDifficulty" NOT NULL DEFAULT 'MEDIUM',
  "remainingObjectives" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "interview_memory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "interview_memory_interviewId_key" ON "interview_memory"("interviewId");

ALTER TABLE "interview_memory"
  ADD CONSTRAINT "interview_memory_interviewId_fkey"
  FOREIGN KEY ("interviewId") REFERENCES "interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
