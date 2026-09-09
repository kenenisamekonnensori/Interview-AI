import { JobDescriptionManager } from "@/features/jobs/components/job-description-manager";
import { TargetJobsManager } from "@/features/jobs/components/target-jobs-manager";
import { ResumeManager } from "@/features/resumes/components/resume-manager";

export default function ResumesPage() {
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <p className="eyebrow">Career context</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em]">Resume & Jobs</h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            Define the job you are preparing for, then attach the resume and job descriptions that
            tailor your practice interviews and future readiness tracking.
          </p>
        </div>
        <TargetJobsManager />
        <ResumeManager />
        <JobDescriptionManager />
      </div>
    </main>
  );
}
