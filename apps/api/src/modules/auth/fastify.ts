import type { ServerEnvironment } from "@interviewer-ai/config";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest, RouteOptions } from "fastify";

import type { createAuth } from "./auth.js";
import { logSafeError } from "../../services/security.js";
import { observability } from "../../services/observability.js";

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

export function createAuthFastifyIntegration(auth: Auth, environment: ServerEnvironment) {
  return {
    route: {
      method: ["GET", "POST"],
      url: "/api/auth/*",
      handler: async (request, reply) => {
        try {
          const authPath = request.url.split("?")[0];
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

          observability().event("authentication.lifecycle", {
            requestId: request.id,
            operation: authPath,
            statusCode: response.status,
          });

          reply.status(response.status);
          response.headers.forEach((value, key) => reply.header(key, value));
          return reply.send(response.body ? await response.text() : null);
        } catch (error) {
          logSafeError(request.log, "Authentication handler failed", error, {
            requestId: request.id,
          });
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
