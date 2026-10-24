import type { Resume, ResumeUploadRequest, ResumeUploadResponse } from "@interviewer-ai/types";
import { apiBinaryClient, apiClient } from "@/lib/api-client";

export const MAXIMUM_RESUME_FILE_SIZE = 10 * 1024 * 1024;
export const ACCEPTED_RESUME_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

/**
 * Resolves standard MIME type for resume files, falling back to file extension
 * when browser/OS (e.g. Linux/Firefox) provides empty or generic MIME types.
 */
export function resolveResumeMimeType(file: File): string {
  if (ACCEPTED_RESUME_MIME_TYPES.has(file.type)) {
    return file.type;
  }
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (name.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return file.type || "application/octet-stream";
}

export function validateResumeFile(file: File): string | null {
  const mimeType = resolveResumeMimeType(file);
  if (!ACCEPTED_RESUME_MIME_TYPES.has(mimeType)) {
    return "Please select a PDF or DOCX file.";
  }
  if (file.size > MAXIMUM_RESUME_FILE_SIZE) {
    return "Your resume must be 10 MB or smaller.";
  }
  return null;
}

export function formatResumeFileSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(bytes < 1024 * 1024 ? 1 : 0)} MB`;
}

type ResumeUploadOptions = {
  activate?: boolean;
  analyze?: boolean;
};

export type ResumeUploadResult = {
  resume: Resume;
  activation: "activated" | "not-requested" | "failed";
  analysis: "started" | "not-started";
  activationError?: string;
  analysisError?: string;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Uploads a resume file with automatic authenticated API fallback
 * if direct object-storage presigned upload fails or is blocked by CORS/signature.
 */
export async function uploadResumeFile(
  file: File,
  { activate = false, analyze = true }: ResumeUploadOptions = {},
): Promise<ResumeUploadResult> {
  const validationError = validateResumeFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const mimeType = resolveResumeMimeType(file) as ResumeUploadRequest["mimeType"];

  const payload: ResumeUploadRequest = {
    fileName: file.name,
    mimeType,
    fileSize: file.size,
  };

  const { resume, upload } = await apiClient<ResumeUploadResponse>("/api/v1/resumes/uploads", {
    method: "POST",
    body: payload,
  });

  let directUploadSucceeded = false;
  try {
    const response = await fetch(upload.url, {
      method: "PUT",
      headers: upload.headers,
      body: file,
    });
    if (response.ok) {
      directUploadSucceeded = true;
    }
  } catch {
    directUploadSucceeded = false;
  }

  let finalResume: Resume;

  if (directUploadSucceeded) {
    const completed = await apiClient<{ resume: Resume }>(`/api/v1/resumes/${resume.id}/complete`, {
      method: "POST",
    });
    finalResume = completed.resume;
  } else {
    // Authenticated API fallback if direct storage origin is blocked, CORS fails, or presigned signature fails
    const completed = await apiBinaryClient<{ resume: Resume }>(
      `/api/v1/resumes/${resume.id}/content`,
      {
        body: file,
        contentType: mimeType,
      },
    );
    finalResume = completed.resume;
  }

  let activation: ResumeUploadResult["activation"] = "not-requested";
  let activationError: string | undefined;
  if (activate) {
    try {
      const activated = await apiClient<{ resume: Resume }>(
        `/api/v1/resumes/${finalResume.id}/activate`,
        { method: "POST" },
      );
      finalResume = activated.resume;
      activation = "activated";
    } catch (error) {
      activation = "failed";
      activationError = errorMessage(error, "We could not set this resume as active.");
    }
  }

  let analysis: ResumeUploadResult["analysis"] = analyze ? "started" : "not-started";
  let analysisError: string | undefined;
  if (analyze) {
    try {
      await apiClient(`/api/v1/resumes/${finalResume.id}/analyze`, { method: "POST" });
    } catch (error) {
      analysis = "not-started";
      analysisError = errorMessage(error, "AI analysis could not be started.");
    }
  }

  return {
    resume: finalResume,
    activation,
    analysis,
    ...(activationError ? { activationError } : {}),
    ...(analysisError ? { analysisError } : {}),
  };
}
