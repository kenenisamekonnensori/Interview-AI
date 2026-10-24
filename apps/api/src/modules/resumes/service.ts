import type { ServerEnvironment } from "@interviewer-ai/config";

import { createResumeRepository } from "./repository.js";
import {
  assertResumeObjectExists,
  createResumeStorageKey,
  createResumeUploadUrl,
  deleteResumeObject,
  uploadResumeObject,
} from "./storage.js";
import type { CreateResumeUploadInput } from "./schema.js";

/**
 * An ANALYZING resume older than this is treated as lost: its dispatch either
 * crashed before completing or the process restarted. The Gemini call itself
 * is already bounded (45 s per attempt plus retries), so past this threshold
 * a stuck status is safe to re-claim and re-dispatch exactly once.
 */
export const staleResumeAnalysisThresholdMs = 5 * 60 * 1000;

export function createResumeService({
  database,
  environment,
}: {
  database: Parameters<typeof createResumeRepository>[0];
  environment: ServerEnvironment;
}) {
  const repository = createResumeRepository(database);

  return {
    /**
     * Presigns before persisting: a storage-configuration failure must not
     * leave an orphan PENDING_UPLOAD row behind.
     */
    async requestUpload(userId: string, input: CreateResumeUploadInput) {
      const storageKey = createResumeStorageKey(userId, input.fileName);
      const upload = await createResumeUploadUrl(environment, storageKey, input.mimeType);
      const resume = await repository.create({ userId, storageKey, ...input });
      return { resume, upload };
    },
    /**
     * Single dispatch gate for /analyze. Starts a fresh attempt for any
     * restartable status, or claims an ANALYZING resume whose last dispatch
     * has gone stale (crashed process, lost job). Returns false when another
     * dispatcher already owns the attempt.
     */
    async claimForAnalysis(resume: {
      id: string;
      status: "PENDING_UPLOAD" | "READY" | "ANALYZING" | "ANALYZED" | "FAILED" | "DELETED";
      analysisStartedAt: Date | null;
    }) {
      if (resume.status === "ANALYZING") {
        const staleBefore = new Date(Date.now() - staleResumeAnalysisThresholdMs);
        const claimed = await repository.claimStaleAnalysis(resume.id, staleBefore);
        return claimed === 1;
      }
      const started = await repository.beginAnalysis(resume.id);
      return started >= 1;
    },
    list: (userId: string, includePending: boolean) => repository.list(userId, includePending),
    async complete(userId: string, id: string) {
      const resume = await this.requireOwned(userId, id);
      if (resume.status === "READY") return resume;
      await assertResumeObjectExists(environment, resume.storageKey, resume);
      const completed = await repository.complete(resume.id);
      return (await repository.setActiveWhenNone(completed.id, userId)) ?? completed;
    },
    async uploadThroughApi(userId: string, id: string, contents: Uint8Array) {
      const resume = await this.requireOwned(userId, id);
      if (resume.status !== "PENDING_UPLOAD")
        throw new ResumeConflictError(
          "This resume has already been uploaded or cannot be uploaded.",
        );
      if (contents.byteLength !== resume.fileSize)
        throw new ResumeConflictError("The uploaded file size does not match the selected resume.");
      await uploadResumeObject(environment, resume.storageKey, contents, {
        mimeType: resume.mimeType,
        userId: resume.userId,
        resumeId: resume.id,
      });
      return this.complete(userId, id);
    },
    async setActive(userId: string, id: string) {
      const resume = await this.requireOwned(userId, id);
      if (resume.status === "PENDING_UPLOAD")
        throw new ResumeConflictError("Finish uploading this resume before making it active.");
      return repository.activate(resume.id, userId);
    },
    async remove(userId: string, id: string) {
      const resume = await this.requireOwned(userId, id);
      await deleteResumeObject(environment, resume.storageKey);
      await repository.softDelete(resume.id);
    },
    async requireOwned(userId: string, id: string) {
      const resume = await repository.findOwned(id, userId);
      if (!resume) throw new ResumeNotFoundError();
      return resume;
    },
  };
}

export class ResumeNotFoundError extends Error {
  constructor() {
    super("Resume not found.");
    this.name = "ResumeNotFoundError";
  }
}
export class ResumeConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeConflictError";
  }
}
