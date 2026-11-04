-- AlterTable
ALTER TABLE "conversation_turn" ADD COLUMN "startedAt" TIMESTAMP(3),
ADD COLUMN "endedAt" TIMESTAMP(3),
ADD COLUMN "durationMs" INTEGER,
ADD COLUMN "words" JSONB;
