import { randomUUID } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ServerEnvironment } from "@interviewer-ai/config";
import { observability } from "../../services/observability.js";

const PRESIGNED_UPLOAD_TTL_SECONDS = 10 * 60;
const resumeOwnerMetadataKey = "owner-user-id";
const resumeIdMetadataKey = "resume-id";

type R2Configuration = {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  secretAccessKey: string;
};

function getR2Configuration(environment: ServerEnvironment): R2Configuration {
  const { R2_ACCESS_KEY_ID, R2_BUCKET, R2_ENDPOINT, R2_SECRET_ACCESS_KEY } = environment;
  if (!R2_ACCESS_KEY_ID || !R2_BUCKET || !R2_ENDPOINT || !R2_SECRET_ACCESS_KEY) {
    throw new ResumeStorageConfigurationError();
  }
  return {
    accessKeyId: R2_ACCESS_KEY_ID,
    bucket: R2_BUCKET,
    endpoint: R2_ENDPOINT,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  };
}

function createClient(configuration: R2Configuration) {
  return new S3Client({
    region: "auto",
    endpoint: configuration.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey,
    },
  });
}

export class ResumeStorageConfigurationError extends Error {
  constructor() {
    super("Resume storage is not configured.");
    this.name = "ResumeStorageConfigurationError";
  }
}

export class ResumeStorageError extends Error {
  constructor() {
    super("The uploaded file could not be verified in storage.");
    this.name = "ResumeStorageError";
  }
}

export function createResumeStorageKey(userId: string, fileName: string) {
  const extension = fileName.toLowerCase().endsWith(".docx") ? "docx" : "pdf";
  return `resumes/${userId}/${randomUUID()}.${extension}`;
}

export async function createResumeUploadUrl(
  environment: ServerEnvironment,
  key: string,
  mimeType: string,
  owner: { userId: string; resumeId: string },
) {
  const configuration = getR2Configuration(environment);
  const url = await observability().time(
    "storage.r2.operation",
    { operation: "create-presigned-upload" },
    () =>
      getSignedUrl(
        createClient(configuration),
        new PutObjectCommand({
          Bucket: configuration.bucket,
          Key: key,
          ContentType: mimeType,
          Metadata: {
            [resumeOwnerMetadataKey]: owner.userId,
            [resumeIdMetadataKey]: owner.resumeId,
          },
        }),
        { expiresIn: PRESIGNED_UPLOAD_TTL_SECONDS },
      ),
  );
  return {
    url,
    headers: {
      "Content-Type": mimeType,
      "x-amz-meta-owner-user-id": owner.userId,
      "x-amz-meta-resume-id": owner.resumeId,
    },
    expiresAt: new Date(Date.now() + PRESIGNED_UPLOAD_TTL_SECONDS * 1000),
  };
}

export async function uploadResumeObject(
  environment: ServerEnvironment,
  key: string,
  contents: Uint8Array,
  owner: { mimeType: string; userId: string; resumeId: string },
) {
  const configuration = getR2Configuration(environment);
  try {
    await observability().time("storage.r2.operation", { operation: "server-upload" }, () =>
      createClient(configuration).send(
        new PutObjectCommand({
          Bucket: configuration.bucket,
          Key: key,
          Body: contents,
          ContentType: owner.mimeType,
          Metadata: {
            [resumeOwnerMetadataKey]: owner.userId,
            [resumeIdMetadataKey]: owner.resumeId,
          },
        }),
      ),
    );
  } catch {
    throw new ResumeStorageError();
  }
}

export async function assertResumeObjectExists(
  environment: ServerEnvironment,
  key: string,
  expected: { fileSize: number; mimeType: string; userId: string; id: string },
) {
  const configuration = getR2Configuration(environment);
  try {
    const object = await observability().time(
      "storage.r2.operation",
      { operation: "head-object" },
      () =>
        createClient(configuration).send(
          new HeadObjectCommand({ Bucket: configuration.bucket, Key: key }),
        ),
    );
    const metadata = object.Metadata ?? {};
    if (
      object.ContentLength !== expected.fileSize ||
      object.ContentType !== expected.mimeType ||
      metadata[resumeOwnerMetadataKey] !== expected.userId ||
      metadata[resumeIdMetadataKey] !== expected.id
    ) {
      throw new ResumeStorageError();
    }
  } catch {
    throw new ResumeStorageError();
  }
}

export async function deleteResumeObject(environment: ServerEnvironment, key: string) {
  const configuration = getR2Configuration(environment);
  try {
    await observability().time("storage.r2.operation", { operation: "delete-object" }, () =>
      createClient(configuration).send(
        new DeleteObjectCommand({ Bucket: configuration.bucket, Key: key }),
      ),
    );
  } catch {
    throw new ResumeStorageError();
  }
}

export async function downloadResumeObject(
  environment: ServerEnvironment,
  resume: { id: string; userId: string; storageKey: string; fileSize: number; mimeType: string },
) {
  const configuration = getR2Configuration(environment);
  try {
    await assertResumeObjectExists(environment, resume.storageKey, resume);
    const object = await observability().time(
      "storage.r2.operation",
      { operation: "get-object" },
      () =>
        createClient(configuration).send(
          new GetObjectCommand({ Bucket: configuration.bucket, Key: resume.storageKey }),
        ),
    );
    if (!object.Body) throw new ResumeStorageError();
    return new Uint8Array(await object.Body.transformToByteArray());
  } catch {
    throw new ResumeStorageError();
  }
}
