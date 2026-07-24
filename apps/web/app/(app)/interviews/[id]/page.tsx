"use client";

import { useParams } from "next/navigation";
import { InterviewMicrophone } from "@/features/conversation/components/microphone";

export default function LiveInterviewPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-10">
      <p className="text-sm font-medium text-primary">Live interview</p>
      <h1 className="mt-2 text-3xl font-semibold">Your practice session</h1>
      <p className="mt-3 text-muted-foreground">
        Start your microphone, answer naturally, and the interviewer will respond.
      </p>
      <div className="mt-8">
        <InterviewMicrophone interviewId={id} />
      </div>
    </main>
  );
}
