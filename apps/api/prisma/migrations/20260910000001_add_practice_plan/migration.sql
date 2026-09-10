-- Add PracticePlan: one persisted, versioned plan per user, regenerated
-- deterministically from interview data with completed items carried over.

CREATE TABLE "practice_plan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "version" INTEGER NOT NULL DEFAULT 1,
    "goal" TEXT NOT NULL,
    "targetRole" TEXT,
    "careerTargetId" TEXT,
    "basedOnInterviewIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "basedOnValidReportCount" INTEGER NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practice_plan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "practice_plan_userId_key" ON "practice_plan"("userId");

CREATE TABLE "practice_plan_item" (
    "id" TEXT NOT NULL,
    "practicePlanId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "phase" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "activityType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "rationale" TEXT NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practice_plan_item_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "practice_plan_item_practicePlanId_idx" ON "practice_plan_item"("practicePlanId");

-- AddForeignKey
ALTER TABLE "practice_plan" ADD CONSTRAINT "practice_plan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_plan" ADD CONSTRAINT "practice_plan_careerTargetId_fkey" FOREIGN KEY ("careerTargetId") REFERENCES "career_target"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_plan_item" ADD CONSTRAINT "practice_plan_item_practicePlanId_fkey" FOREIGN KEY ("practicePlanId") REFERENCES "practice_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;