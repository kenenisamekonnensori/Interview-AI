import { InterviewManager } from "@/features/interviews/components/interview-manager";
import { JobDescriptionManager } from "@/features/jobs/components/job-description-manager";
import { ResumeManager } from "@/features/resumes/components/resume-manager";

export default function NewInterviewPage() {
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="eyebrow">Interview setup</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] sm:text-[2.5rem]">
          Create a practice session
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Add your context first, then configure a realistic interview around the role you want.
        </p>
        <div className="mt-8 flex items-center gap-2 overflow-x-auto pb-1 text-xs sm:text-sm">
          <p className="whitespace-nowrap rounded-full border border-primary/40 bg-primary/10 px-4 py-2 font-medium text-primary">
            01 · Your resume
          </p>
          <span className="h-px w-6 shrink-0 bg-border" />
          <p className="whitespace-nowrap rounded-full border border-border bg-card/60 px-4 py-2">
            02 · Target role
          </p>
          <span className="h-px w-6 shrink-0 bg-border" />
          <p className="whitespace-nowrap rounded-full border border-border bg-card/60 px-4 py-2">
            03 · Session details
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
      </div>
    </main>
  );
}
