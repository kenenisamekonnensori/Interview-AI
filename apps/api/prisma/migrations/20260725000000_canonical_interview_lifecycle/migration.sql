-- Replace legacy lifecycle values with the canonical shared contract.
CREATE TYPE "InterviewStatus_new" AS ENUM ('DRAFT', 'PREPARING', 'READY', 'IN_PROGRESS', 'COMPLETING', 'COMPLETED', 'CANCELLED', 'FAILED');
ALTER TABLE "interview"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "InterviewStatus_new" USING (
    CASE "status"::text WHEN 'PAUSED' THEN 'IN_PROGRESS' ELSE "status"::text END
  )::"InterviewStatus_new",
  ALTER COLUMN "status" SET DEFAULT 'DRAFT';
DROP TYPE "InterviewStatus";
ALTER TYPE "InterviewStatus_new" RENAME TO "InterviewStatus";

CREATE TYPE "ConversationState_new" AS ENUM ('GREETING', 'LISTENING', 'TRANSCRIBING', 'THINKING', 'SPEAKING', 'CLOSING', 'COMPLETED');
ALTER TABLE "conversation"
  ALTER COLUMN "state" DROP DEFAULT,
  ALTER COLUMN "state" TYPE "ConversationState_new" USING "state"::text::"ConversationState_new",
  ALTER COLUMN "state" SET DEFAULT 'GREETING';
DROP TYPE "ConversationState";
ALTER TYPE "ConversationState_new" RENAME TO "ConversationState";
