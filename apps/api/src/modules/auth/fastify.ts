import type { ServerEnvironment } from "@interviewer-ai/config";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest, RouteOptions } from "fastify";

import type { createAuth } from "./auth.js";
import { credentialLoginSchema, credentialSignupSchema } from "./signup.js";

type Auth = ReturnType<typeof createAuth>["auth"];

export type AuthenticatedUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
};

export type AuthContext = {
  sessionId: string;
  user: AuthenticatedUser;
};

declare module "fastify" {
  interface FastifyInstance {
    requireSession: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireVerifiedUser: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    authContext: AuthContext | null;
  }
}

function toAuthContext(session: NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>) {
  return {
    sessionId: session.session.id,
    user: {
      id: session.user.id,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      name: session.user.name,
    },
  };
}

async function authenticateRequest(auth: Auth, request: FastifyRequest) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  });

  if (!session) {
    return null;
  }

  const context = toAuthContext(session);
  request.authContext = context;
  return context;
}

function sendUnauthorized(reply: FastifyReply) {
  reply.status(401).send({
    code: "AUTHENTICATION_REQUIRED",
    message: "Authentication is required.",
  });
}

function validateCredentialRequest(request: FastifyRequest, reply: FastifyReply) {
  const path = request.url.split("?")[0];
  const schema =
    path === "/api/auth/sign-up/email"
      ? credentialSignupSchema
      : path === "/api/auth/sign-in/email"
        ? credentialLoginSchema
        : null;

  if (!schema) {
    return true;
  }

  const credentials = schema.safeParse(request.body);

  if (credentials.success) {
    request.body = credentials.data;
    return true;
  }

  reply.status(400).send({
    code: "VALIDATION_ERROR",
    message:
      path === "/api/auth/sign-in/email"
        ? "Enter a valid email address and password."
        : "Enter a valid name, email address, and password.",
  });
  return false;
}

export function createAuthFastifyIntegration(auth: Auth, environment: ServerEnvironment) {
  return {
    route: {
      method: ["GET", "POST"],
      url: "/api/auth/*",
      handler: async (request, reply) => {
        try {
          if (request.method === "POST" && !validateCredentialRequest(request, reply)) {
            return;
          }

          const url = new URL(request.url, environment.BETTER_AUTH_URL);
          const headers = fromNodeHeaders(request.headers);
          const body = request.body === undefined ? undefined : JSON.stringify(request.body);
          const requestInit = {
            method: request.method,
            headers,
            ...(body === undefined ? {} : { body }),
          };
          const authRequest = new Request(url, requestInit);
          const response = await auth.handler(authRequest);

          reply.status(response.status);
          response.headers.forEach((value, key) => reply.header(key, value));
          return reply.send(response.body ? await response.text() : null);
        } catch (error) {
          request.log.error(error, "Authentication handler failed");
          return reply.status(500).send({
            code: "AUTH_FAILURE",
            message: "An authentication error occurred.",
          });
        }
      },
    } satisfies RouteOptions,

    requireSession: async (request: FastifyRequest, reply: FastifyReply) => {
      const context = await authenticateRequest(auth, request);

      if (!context) {
        sendUnauthorized(reply);
      }
    },

    requireVerifiedUser: async (request: FastifyRequest, reply: FastifyReply) => {
      const context = await authenticateRequest(auth, request);

      if (!context) {
        sendUnauthorized(reply);
        return;
      }

      if (!context.user.emailVerified) {
        reply.status(403).send({
          code: "EMAIL_VERIFICATION_REQUIRED",
          message: "Email verification is required.",
        });
      }
    },
  };
}
