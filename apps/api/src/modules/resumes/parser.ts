import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const MAX_EXTRACTED_CHARACTERS = 120_000;

export class ResumeParseError extends Error {
  constructor() {
    super("The resume could not be read. Upload a text-based PDF or DOCX file.");
    this.name = "ResumeParseError";
  }
}

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]) {
  return prefix.every((value, index) => bytes[index] === value);
}

export function assertResumeMimeMatchesContent(bytes: Uint8Array, mimeType: string) {
  const matchesPdf = hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  const matchesZip = hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04]);
  if (
    (mimeType === "application/pdf" && !matchesPdf) ||
    (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
      !matchesZip)
  ) {
    throw new ResumeParseError();
  }
}

function normalizeText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractResumeText(bytes: Uint8Array, mimeType: string) {
  try {
    assertResumeMimeMatchesContent(bytes, mimeType);
    const rawText =
      mimeType === "application/pdf"
        ? (await new PDFParse({ data: bytes }).getText()).text
        : (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
    const text = normalizeText(rawText);
    if (!text) throw new ResumeParseError();
    return text.slice(0, MAX_EXTRACTED_CHARACTERS);
  } catch (error) {
    if (error instanceof ResumeParseError) throw error;
    throw new ResumeParseError();
  }
}
