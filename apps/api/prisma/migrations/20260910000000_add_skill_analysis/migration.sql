-- Add SkillAnalysis: one persisted, versioned AI interpretation per user,
-- refreshed only after interview reports complete (never on page load).

CREATE TABLE "skill_analysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GENERATING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "model" TEXT,
    "summary" TEXT,
    "insights" JSONB,
    "basedOnInterviewIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "basedOnObservationCount" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_analysis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "skill_analysis_userId_key" ON "skill_analysis"("userId");

-- AddForeignKey
ALTER TABLE "skill_analysis" ADD CONSTRAINT "skill_analysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;