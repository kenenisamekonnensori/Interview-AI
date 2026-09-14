-- CreateEnum
CREATE TYPE "ReadinessTrigger" AS ENUM ('REPORT_READY', 'MANUAL');

-- DropIndex
DROP INDEX "interview_userId_careerTargetId_idx";

-- AlterTable
ALTER TABLE "interview_report" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "user_profile" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "readiness_snapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "careerTargetId" TEXT,
    "overall" INTEGER NOT NULL,
    "components" JSONB NOT NULL,
    "formulaVersion" INTEGER NOT NULL,
    "interviewCount" INTEGER NOT NULL,
    "validReportCount" INTEGER NOT NULL,
    "trigger" "ReadinessTrigger" NOT NULL DEFAULT 'REPORT_READY',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "readiness_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "readiness_snapshot_userId_recordedAt_idx" ON "readiness_snapshot"("userId", "recordedAt");

-- CreateIndex
CREATE INDEX "readiness_snapshot_userId_careerTargetId_recordedAt_idx" ON "readiness_snapshot"("userId", "careerTargetId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "readiness_snapshot_userId_careerTargetId_validReportCount_key" ON "readiness_snapshot"("userId", "careerTargetId", "validReportCount");

-- AddForeignKey
ALTER TABLE "readiness_snapshot" ADD CONSTRAINT "readiness_snapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
