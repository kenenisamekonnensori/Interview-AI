CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');
CREATE TYPE "HiringRecommendation" AS ENUM ('STRONG_HIRE', 'HIRE', 'NO_HIRE', 'STRONG_NO_HIRE');

ALTER TABLE "interview_report"
  ADD COLUMN "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "evidence" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "hiringRecommendation" "HiringRecommendation",
  ADD COLUMN "failureReason" TEXT,
  ADD COLUMN "generationAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "interview_report"
  ALTER COLUMN "evaluation" DROP NOT NULL,
  ALTER COLUMN "summary" DROP NOT NULL,
  ALTER COLUMN "generatedAt" DROP DEFAULT,
  ALTER COLUMN "generatedAt" DROP NOT NULL,
  ALTER COLUMN "model" DROP NOT NULL;

UPDATE "interview_report" SET "status" = 'READY' WHERE "evaluation" IS NOT NULL;
