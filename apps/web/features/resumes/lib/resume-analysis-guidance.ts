import type { Resume, ResumeAnalysisFailureCode } from "@interviewer-ai/types";

/**
 * Single source of truth for user-facing resume analysis failure copy.
 * `analysisFailureCode` is stored server-side and returned on every resume DTO;
 * the UI maps it to safe, action-oriented text — never provider internals.
 */
type ResumeAnalysisFailureCopy = {
  /** Short label for status chips. */
  label: string;
  /** Full, action-oriented explanation. */
  message: string;
  /** Whether clicking the Analyze/Retry action is meaningful. */
  retryable: boolean;
};

const systemErrorCopy: ResumeAnalysisFailureCopy = {
  label: "System error",
  message:
    "An unexpected system error stopped the analysis. This is usually temporary — click Analyze to retry.",
  retryable: true,
};

const failureCopyByCode: Record<ResumeAnalysisFailureCode, ResumeAnalysisFailureCopy> = {
  AI_CONFIGURATION: {
    label: "AI not configured",
    message:
      "Resume analysis could not run because the AI service is not configured in this environment (missing or invalid API key). Try again later or contact support — your resume is safely stored.",
    retryable: false,
  },
  AI_UNAVAILABLE: {
    label: "AI unavailable",
    message:
      "The AI service was temporarily unavailable or rate-limited. Click Analyze to retry — your resume and profile are safe.",
    retryable: true,
  },
  DOCUMENT_UNREADABLE: {
    label: "Unreadable document",
    message:
      "We could not read this document. Upload a text-based PDF or DOCX (not a scanned image), then analyze it again.",
    retryable: true,
  },
  STORAGE_UNAVAILABLE: {
    label: "Storage unavailable",
    message:
      "The stored resume file could not be retrieved from storage. Click Analyze to retry, or re-upload the file.",
    retryable: true,
  },
  SYSTEM_ERROR: systemErrorCopy,
};

export function resumeAnalysisFailureCopy(
  code: Resume["analysisFailureCode"],
): ResumeAnalysisFailureCopy {
  return (code && failureCopyByCode[code]) || systemErrorCopy;
}

export function resumeAnalysisFailureLabel(code: Resume["analysisFailureCode"]): string {
  return resumeAnalysisFailureCopy(code).label;
}

export function resumeAnalysisFailureMessage(code: Resume["analysisFailureCode"]): string {
  return resumeAnalysisFailureCopy(code).message;
}

/**
 * Guidance shown when a candidate tries to use a resume for a personalized
 * interview. The design keeps storage and AI analysis decoupled: a stored
 * resume is never a failure, and every non-ready state names the exact next
 * action instead of blocking with a generic error.
 */
export function resumeAnalysisGuidance(resume: Resume): string {
  if (resume.status === "ANALYZING") {
    return "AI analysis is still in progress. Wait a moment; if it stays stuck, click Analyze again to restart it.";
  }
  if (resume.status === "FAILED") {
    const copy = resumeAnalysisFailureCopy(resume.analysisFailureCode);
    return copy.retryable
      ? `Resume analysis did not finish: ${copy.message}`
      : copy.message;
  }
  return "This resume has not been analyzed yet. Open your profile and click Analyze resume so the AI can use it to prepare the interview.";
}
