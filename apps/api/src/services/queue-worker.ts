import { UnrecoverableError, type Job, type Worker } from "bullmq";
import { z } from "zod";

import { AiProviderError } from "../modules/ai/errors.js";
import { ResumeParseError } from "../modules/resumes/parser.js";
import { ResumeStorageConfigurationError, ResumeStorageError } from "../modules/resumes/storage.js";
import { observability } from "./observability.js";

export type QueueFailure = {
  code:
    | "AI_CONFIGURATION"
    | "AI_INVALID_OUTPUT"
    | "AI_PROVIDER_REJECTED"
    | "DOCUMENT_INVALID"
    | "STORAGE_CONFIGURATION"
    | "STORAGE_VERIFICATION_FAILED"
    | "UNEXPECTED_DEPENDENCY_FAILURE";
  retryable: boolean;
};

export function classifyQueueFailure(error: unknown): QueueFailure {
  if (error instanceof AiProviderError) {
    if (error.category === "TRANSIENT") {
      return { code: "AI_PROVIDER_REJECTED", retryable: true };
    }
    return {
      code:
        error.category === "CONFIGURATION"
          ? "AI_CONFIGURATION"
          : error.category === "INVALID_OUTPUT"
            ? "AI_INVALID_OUTPUT"
            : "AI_PROVIDER_REJECTED",
      retryable: false,
    };
  }
  if (error instanceof ResumeParseError || error instanceof z.ZodError) {
    return { code: "DOCUMENT_INVALID", retryable: false };
  }
  if (error instanceof ResumeStorageConfigurationError) {
    return { code: "STORAGE_CONFIGURATION", retryable: false };
  }
  if (error instanceof ResumeStorageError) {
    return { code: "STORAGE_VERIFICATION_FAILED", retryable: false };
  }
  return { code: "UNEXPECTED_DEPENDENCY_FAILURE", retryable: true };
}

export async function processQueueJob<T>(
  job: Job,
  {
    queue,
    execute,
    onTerminalFailure,
  }: {
    queue: string;
    execute: () => Promise<T>;
    onTerminalFailure: (failure: QueueFailure) => Promise<void>;
  },
) {
  try {
    return await execute();
  } catch (error) {
    const failure = classifyQueueFailure(error);
    const attempt = job.attemptsMade + 1;
    const attempts = job.opts.attempts ?? 1;
    const willRetry = failure.retryable && attempt < attempts;
    observability().event(willRetry ? "queue.job.retrying" : "queue.job.failed", {
      queue,
      jobId: job.id,
      attempt,
      attempts,
      failureCode: failure.code,
      retryable: failure.retryable,
    });
    if (!willRetry) await onTerminalFailure(failure);
    const safeMessage = `QUEUE_FAILURE:${failure.code}`;
    if (willRetry) throw new Error(safeMessage);
    throw new UnrecoverableError(safeMessage);
  }
}

/** Stops fetching work, lets in-flight jobs settle, then releases worker resources. */
export function installWorkerShutdown({
  worker,
  closeDependencies,
  logger = observability(),
}: {
  worker: Worker;
  closeDependencies: () => Promise<void>;
  logger?: Pick<ReturnType<typeof observability>, "event">;
}) {
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.event("queue.worker.shutdown.started", { queue: worker.name, signal });
    await worker.pause(true);
    await worker.close();
    await closeDependencies();
    logger.event("queue.worker.shutdown.completed", { queue: worker.name, signal });
  };
  return shutdown;
}
