import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const MAX_EXTRACTED_CHARACTERS = 120_000;

export class ResumeParseError extends Error {
  constructor() {
    super("The resume could not be read. Upload a text-based PDF or DOCX file.");
    this.name = "ResumeParseError";
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
