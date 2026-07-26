"use client";

import { useParams } from "next/navigation";

import { ReportReview } from "@/features/reports/components/report-review";

export default function InterviewReportPage() {
  const { id } = useParams<{ id: string }>();
  return <ReportReview interviewId={id} />;
}
