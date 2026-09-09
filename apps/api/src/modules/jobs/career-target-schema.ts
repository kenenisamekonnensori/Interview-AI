import { z } from "zod";

export const careerTargetIdSchema = z.object({ id: z.uuid() });
