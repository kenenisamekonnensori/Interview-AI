-- CreateTable
CREATE TABLE "interview_usage" (
    "interviewId" TEXT NOT NULL,
    "voiceSeconds" INTEGER NOT NULL DEFAULT 0,
    "thinkRequests" INTEGER NOT NULL DEFAULT 0,
    "speakCharacters" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_usage_pkey" PRIMARY KEY ("interviewId")
);

-- AddForeignKey
ALTER TABLE "interview_usage" ADD CONSTRAINT "interview_usage_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
