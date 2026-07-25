import { InterviewManager } from "@/features/interviews/components/interview-manager";
import { JobDescriptionManager } from "@/features/jobs/components/job-description-manager";
import { ResumeManager } from "@/features/resumes/components/resume-manager";

export default function NewInterviewPage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 py-10">
      <p className="text-sm font-medium text-primary">Interview setup</p>
      <h1 className="mt-2 text-4xl font-semibold">Create a practice session</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Add your context first, then configure a realistic interview around the role you want.
      </p>
      <div className="mt-8 grid gap-3 text-sm sm:grid-cols-3">
        <p className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 font-medium text-primary">
          1. Add your resume
        </p>
        <p className="rounded-xl border border-border bg-card/60 px-4 py-3">2. Add a target role</p>
        <p className="rounded-xl border border-border bg-card/60 px-4 py-3">
          3. Configure interview
        </p>
      </div>
      <div className="mt-8 space-y-6">
        <section id="resumes">
          <ResumeManager />
        </section>
        <section id="roles">
          <JobDescriptionManager />
        </section>
        <section id="configuration">
          <InterviewManager />
        </section>
      </div>
    </main>
  );
}
