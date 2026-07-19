import { z } from "zod";

const credentialEmailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());

const credentialPasswordSchema = z.string().min(12).max(128);
const callbackUrlSchema = z.string().url().optional();

export const credentialSignupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: credentialEmailSchema,
  password: credentialPasswordSchema,
  callbackURL: callbackUrlSchema,
});

export const credentialLoginSchema = z.object({
  email: credentialEmailSchema,
  password: credentialPasswordSchema,
  rememberMe: z.boolean().optional().default(true),
  callbackURL: callbackUrlSchema,
});
