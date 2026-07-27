import { InterviewManager } from "@/features/interviews/components/interview-manager";

export default function NewInterviewPage() {
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <p className="eyebrow">Practice interview</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] sm:text-[2.5rem]">
          Start where you are.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Begin with a recommendation based on your saved context, or tailor a session in a few
          focused choices.
        </p>
        <div className="mt-8">
          <InterviewManager />
        </div>
      </div>
    </main>
  );
}
