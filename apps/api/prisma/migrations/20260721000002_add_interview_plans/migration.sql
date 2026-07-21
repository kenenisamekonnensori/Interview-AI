CREATE TABLE "interview_plan" (
  "id" TEXT NOT NULL, "interviewId" TEXT NOT NULL, "objectives" JSONB NOT NULL,
  "topics" JSONB NOT NULL, "evaluationRubric" JSONB NOT NULL, "timeline" JSONB NOT NULL,
  "followUpStrategy" TEXT NOT NULL, "fallbackStrategy" TEXT NOT NULL, "model" TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "interview_plan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "interview_plan_interviewId_key" ON "interview_plan"("interviewId");
ALTER TABLE "interview_plan" ADD CONSTRAINT "interview_plan_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
