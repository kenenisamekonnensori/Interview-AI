-- CreateEnum
CREATE TYPE "ResumeStatus" AS ENUM ('PENDING_UPLOAD', 'READY', 'DELETED');

-- CreateTable
CREATE TABLE "resume" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "status" "ResumeStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "uploadedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resume_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resume_storageKey_key" ON "resume"("storageKey");
CREATE INDEX "resume_userId_createdAt_idx" ON "resume"("userId", "createdAt");
CREATE INDEX "resume_userId_isActive_idx" ON "resume"("userId", "isActive");

-- AddForeignKey
ALTER TABLE "resume" ADD CONSTRAINT "resume_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
