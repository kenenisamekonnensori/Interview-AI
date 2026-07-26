import { z } from "zod";

export const interviewerResponseProposalSchema = z
  .object({
    responseText: z.string().trim().min(1).max(4_000),
    responseType: z.enum(["QUESTION", "FOLLOW_UP", "CLARIFICATION", "CLOSING"]),
    recommendedAction: z.enum([
      "ASK_QUESTION",
      "ASK_FOLLOW_UP",
      "REQUEST_CLARIFICATION",
      "CLOSE_INTERVIEW",
    ]),
    topicReference: z.string().trim().min(1).max(200).optional(),
    objectiveReference: z.string().trim().min(1).max(200).optional(),
    suggestedNextConversationState: z.enum(["SPEAKING", "CLOSING"]),
    assessment: z
      .object({
        answerDepth: z.enum(["SHALLOW", "ADEQUATE", "STRONG"]),
        followUpNeeded: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((proposal, context) => {
    const expectedAction = {
      QUESTION: "ASK_QUESTION",
      FOLLOW_UP: "ASK_FOLLOW_UP",
      CLARIFICATION: "REQUEST_CLARIFICATION",
      CLOSING: "CLOSE_INTERVIEW",
    } as const;
    if (proposal.recommendedAction !== expectedAction[proposal.responseType]) {
      context.addIssue({
        code: "custom",
        message: "responseType and recommendedAction must agree.",
      });
    }
    const expectedState = proposal.responseType === "CLOSING" ? "CLOSING" : "SPEAKING";
    if (proposal.suggestedNextConversationState !== expectedState) {
      context.addIssue({
        code: "custom",
        message: "responseType and suggestedNextConversationState must agree.",
      });
    }
  });
