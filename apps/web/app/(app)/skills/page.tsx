import { PlaceholderSection } from "@/features/dashboard/components/placeholder-section";

export default function SkillsPage() {
  return (
    <PlaceholderSection
      eyebrow="Skills & Weaknesses"
      title="Skill tracking is coming soon"
      description="Recurring strengths and weaknesses across your interviews will be identified here, so you can see exactly which skills to work on. Keep completing interviews — every scored report makes this analysis richer."
      action={{ href: "/interviews/new", label: "Start an interview" }}
    />
  );
}
