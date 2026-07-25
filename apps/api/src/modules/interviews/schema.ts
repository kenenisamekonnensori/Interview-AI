import { interviewConfigurationSchema } from "@interviewer-ai/types";
import { z } from "zod";

export const createInterviewSchema = interviewConfigurationSchema;
export const interviewIdSchema = z.object({ id: z.uuid() });
