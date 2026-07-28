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

export function createResumeService({
  database,
  environment,
}: {
  database: Parameters<typeof createResumeRepository>[0];
  environment: ServerEnvironment;
}) {
  const repository = createResumeRepository(database);

  return {
    async requestUpload(userId: string, input: CreateResumeUploadInput) {
      const storageKey = createResumeStorageKey(userId, input.fileName);
      const resume = await repository.create({ userId, storageKey, ...input });
      const upload = await createResumeUploadUrl(environment, storageKey, input.mimeType, {
        userId,
        resumeId: resume.id,
      });
      return { resume, upload };
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
      if (resume.status !== "READY")
        throw new ResumeConflictError("Only uploaded resumes can be active.");
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
