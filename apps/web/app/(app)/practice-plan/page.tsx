import { PlaceholderSection } from "@/features/dashboard/components/placeholder-section";

export default function PracticePlanPage() {
  return (
    <PlaceholderSection
      eyebrow="Practice Plan"
      title="Personalized practice plans are coming soon"
      description="A personalized plan built from your performance history will live here, recommending what to practice next. For now, your dashboard recommends the next best interview after every completed session."
      action={{ href: "/dashboard", label: "See today's recommendation" }}
    />
  );
}
