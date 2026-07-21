CREATE TYPE "ConversationState" AS ENUM ('GREETING','LISTENING','THINKING','SPEAKING','CLOSING','COMPLETED');
CREATE TYPE "ConversationSpeaker" AS ENUM ('USER','AI','SYSTEM');
CREATE TYPE "ConversationTurnType" AS ENUM ('GREETING','QUESTION','ANSWER','FOLLOW_UP','CLARIFICATION','CLOSING');
CREATE TABLE "conversation" ("id" TEXT NOT NULL,"interviewId" TEXT NOT NULL,"state" "ConversationState" NOT NULL DEFAULT 'GREETING',"sequence" INTEGER NOT NULL DEFAULT 0,"startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"completedAt" TIMESTAMP(3),CONSTRAINT "conversation_pkey" PRIMARY KEY ("id"));
CREATE TABLE "conversation_turn" ("id" TEXT NOT NULL,"conversationId" TEXT NOT NULL,"sequence" INTEGER NOT NULL,"speaker" "ConversationSpeaker" NOT NULL,"type" "ConversationTurnType" NOT NULL,"text" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "conversation_turn_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "conversation_interviewId_key" ON "conversation"("interviewId"); CREATE UNIQUE INDEX "conversation_turn_conversationId_sequence_key" ON "conversation_turn"("conversationId","sequence");
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_turn" ADD CONSTRAINT "conversation_turn_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
