ALTER TABLE "interview"
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE TABLE "interview_report" (
  "id" TEXT NOT NULL,
  "interviewId" TEXT NOT NULL,
  "evaluation" JSONB NOT NULL,
  "summary" TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "model" TEXT NOT NULL,

  CONSTRAINT "interview_report_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "interview_report_interviewId_key" ON "interview_report"("interviewId");

ALTER TABLE "interview_report"
  ADD CONSTRAINT "interview_report_interviewId_fkey"
  FOREIGN KEY ("interviewId") REFERENCES "interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
