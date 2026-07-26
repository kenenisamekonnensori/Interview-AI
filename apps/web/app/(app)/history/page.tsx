import { AnalyticsOverview } from "@/features/analytics/components/history";

export default function HistoryPage() {
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="eyebrow">Practice history</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em]">
          Your progress, based on real sessions.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Scores and changes include only completed interviews with valid, ready reports. Trends
          remain separated by interview type.
        </p>
        <div className="mt-8">
          <AnalyticsOverview />
        </div>
      </div>
    </main>
  );
}
