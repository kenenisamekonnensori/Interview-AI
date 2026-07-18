-- CreateTable
CREATE TABLE "auth_email_outbox" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT,
    "recipient" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "auth_email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_email_outbox_availableAt_idx" ON "auth_email_outbox"("availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "auth_email_outbox_eventKey_key" ON "auth_email_outbox"("eventKey");

-- CreateIndex
CREATE INDEX "auth_email_outbox_userId_idx" ON "auth_email_outbox"("userId");

-- AddForeignKey
ALTER TABLE "auth_email_outbox" ADD CONSTRAINT "auth_email_outbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
