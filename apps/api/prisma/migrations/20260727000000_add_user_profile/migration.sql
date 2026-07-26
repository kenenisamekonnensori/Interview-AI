CREATE TABLE "user_profile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "preferredName" TEXT,
  "profession" TEXT,
  "targetRole" TEXT,
  "seniority" TEXT,
  "yearsOfExperience" INTEGER,
  "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
  "defaultInterviewDuration" INTEGER NOT NULL DEFAULT 30,
  "defaultDifficulty" "InterviewDifficulty" NOT NULL DEFAULT 'MEDIUM',
  "voicePreference" TEXT,
  "accessibilityPreferences" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_profile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_profile_userId_key" ON "user_profile"("userId");
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
