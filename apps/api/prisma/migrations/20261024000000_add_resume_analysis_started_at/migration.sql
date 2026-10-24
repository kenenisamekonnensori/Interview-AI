ALTER TABLE "resume" ADD COLUMN "analysisStartedAt" TIMESTAMP(3);

-- Pre-migration ANALYZING rows have no dispatch timestamp and could never pass
-- the staleness comparison, so backfill them as expired to make them
-- claimable by the first retry.
UPDATE "resume"
SET "analysisStartedAt" = '1970-01-01 00:00:00'::timestamp
WHERE "status" = 'ANALYZING' AND "analysisStartedAt" IS NULL;
