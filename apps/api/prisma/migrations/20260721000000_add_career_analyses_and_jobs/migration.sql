-- AlterEnum
ALTER TYPE "ResumeStatus" ADD VALUE 'ANALYZING';
ALTER TYPE "ResumeStatus" ADD VALUE 'ANALYZED';
ALTER TYPE "ResumeStatus" ADD VALUE 'FAILED';

-- CreateEnum
CREATE TYPE "JobDescriptionStatus" AS ENUM ('READY', 'ANALYZING', 'ANALYZED', 'FAILED', 'DELETED');

-- CreateTable
CREATE TABLE "resume_analysis" (
    "id" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "skills" JSONB NOT NULL,
    "technologies" JSONB NOT NULL,
    "experience" JSONB NOT NULL,
    "education" JSONB NOT NULL,
    "projects" JSONB NOT NULL,
    "certifications" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "model" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "resume_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_description" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "company" TEXT,
    "rawText" TEXT NOT NULL,
    "status" "JobDescriptionStatus" NOT NULL DEFAULT 'READY',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "job_description_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_analysis" (
    "id" TEXT NOT NULL,
    "jobDescriptionId" TEXT NOT NULL,
    "requiredSkills" JSONB NOT NULL,
    "preferredSkills" JSONB NOT NULL,
    "responsibilities" JSONB NOT NULL,
    "keywords" JSONB NOT NULL,
    "seniority" TEXT,
    "technologyStack" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "model" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "job_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resume_analysis_resumeId_key" ON "resume_analysis"("resumeId");
CREATE INDEX "job_description_userId_createdAt_idx" ON "job_description"("userId", "createdAt");
CREATE UNIQUE INDEX "job_analysis_jobDescriptionId_key" ON "job_analysis"("jobDescriptionId");

-- AddForeignKey
ALTER TABLE "resume_analysis" ADD CONSTRAINT "resume_analysis_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_description" ADD CONSTRAINT "job_description_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_analysis" ADD CONSTRAINT "job_analysis_jobDescriptionId_fkey" FOREIGN KEY ("jobDescriptionId") REFERENCES "job_description"("id") ON DELETE CASCADE ON UPDATE CASCADE;
