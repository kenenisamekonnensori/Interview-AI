import { webEnvironmentSchema } from "@interviewer-ai/config";

export const webEnvironment = webEnvironmentSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});
