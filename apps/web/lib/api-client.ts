import { webEnvironment } from "@/lib/env";
import type { ApiErrorShape } from "@interviewer-ai/types";

type ApiRequestOptions = Omit<RequestInit, "body" | "headers" | "method"> & {
  body?: unknown;
  headers?: HeadersInit;
  method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
};

type ApiErrorBody = Partial<ApiErrorShape>;

export class ApiError extends Error {
  readonly code: string | undefined;
  readonly status: number;
  readonly details: ApiErrorShape["details"];

  constructor({ code, message, details, status }: ApiErrorBody & { status: number }) {
    super(message ?? "The request could not be completed.");
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

function buildUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  return `${webEnvironment.NEXT_PUBLIC_API_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) {
    return response.text();
  }
  return response.json();
}

export async function apiClient<T>(
  path: string,
  { body, headers, method = "GET", credentials, ...options }: ApiRequestOptions = {},
): Promise<T> {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Accept", "application/json");

  if (body !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const requestInit: RequestInit = {
    ...options,
    credentials: credentials ?? "include",
    headers: requestHeaders,
    method,
  };

  if (body !== undefined) {
    requestInit.body = JSON.stringify(body);
  }

  const response = await fetch(buildUrl(path), requestInit);
  const responseBody = await readResponseBody(response);

  if (!response.ok) {
    if (responseBody && typeof responseBody === "object") {
      throw new ApiError({ ...(responseBody as ApiErrorBody), status: response.status });
    }

    throw new ApiError({
      message:
        typeof responseBody === "string" ? responseBody : "The request could not be completed.",
      status: response.status,
    });
  }

  return responseBody as T;
}
