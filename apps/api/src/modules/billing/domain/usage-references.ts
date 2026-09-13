/**
 * Reference types recorded on usage ledger rows. They identify the class of
 * application operation that caused the consumption, and together with the
 * referenced entity id they form the idempotency key that makes retries safe.
 */
export const usageReferenceTypes = {
  /** One mock interview; reference id is the interview id. */
  MOCK_INTERVIEW: "INTERVIEW",
  /** One AI skill interpretation; reference id is the user id plus evidence size. */
  AI_ANALYSIS: "SKILL_ANALYSIS",
} as const;

export type UsageReferenceType = (typeof usageReferenceTypes)[keyof typeof usageReferenceTypes];
