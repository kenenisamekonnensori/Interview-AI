export type HealthStatus = {
  status: "ok";
};

export type ResumeStatus = "PENDING_UPLOAD" | "READY" | "DELETED";

export type Resume = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: ResumeStatus;
  isActive: boolean;
  uploadedAt: string | null;
  createdAt: string;
};

export type ResumeUploadRequest = {
  fileName: string;
  mimeType:
    "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  fileSize: number;
};

export type ResumeUploadResponse = {
  resume: Resume;
  upload: { url: string; headers: Record<string, string>; expiresAt: string };
};
