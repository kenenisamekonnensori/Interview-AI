"use client";

import { createAuthClient } from "better-auth/react";

import { webEnvironment } from "@/lib/env";

const authBaseUrl = `${webEnvironment.NEXT_PUBLIC_API_URL.replace(/\/$/, "")}/api/auth`;

/** Browser client for the Fastify-mounted Better Auth endpoints. */
export const authClient = createAuthClient({
  baseURL: authBaseUrl,
  fetchOptions: { credentials: "include" },
});
