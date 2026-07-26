"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Save } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";

type Profile = {
  preferredName: string | null;
  profession: string | null;
  targetRole: string | null;
  seniority: string | null;
  yearsOfExperience: number | null;
  preferredLanguage: string;
  defaultInterviewDuration: number;
  defaultDifficulty: "EASY" | "MEDIUM" | "HARD" | "EXPERT";
  voicePreference: string | null;
  accessibilityPreferences: {
    captions: boolean;
    reduceMotion: boolean;
    highContrast: boolean;
    keyboardNavigation: boolean;
  };
};

export function ProfileForm() {
  const client = useQueryClient();
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => apiClient<{ profile: Profile }>("/api/v1/profile"),
  });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: Profile) => apiClient("/api/v1/profile", { method: "PUT", body }),
    onSuccess: () => {
      setError(null);
      client.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : "Could not save your settings."),
  });
  if (profile.isPending)
    return (
      <main className="grid min-h-[calc(100vh-5rem)] place-items-center">
        <LoaderCircle className="size-6 animate-spin text-primary" />
      </main>
    );
  if (profile.error || !profile.data)
    return (
      <main className="mx-auto max-w-xl px-5 py-16 text-center text-muted-foreground">
        {profile.error instanceof Error ? profile.error.message : "Profile unavailable."}
      </main>
    );
  const initial = profile.data.profile;
  return (
    <ProfileEditor
      key={JSON.stringify(initial)}
      initial={initial}
      saving={save.isPending}
      error={error}
      onSave={save.mutate}
    />
  );
}

function ProfileEditor({
  initial,
  saving,
  error,
  onSave,
}: {
  initial: Profile;
  saving: boolean;
  error: string | null;
  onSave: (value: Profile) => void;
}) {
  const [value, setValue] = useState(initial);
  const update = <K extends keyof Profile>(key: K, next: Profile[K]) =>
    setValue((current) => ({ ...current, [key]: next }));
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <form
        className="mx-auto max-w-3xl space-y-7"
        onSubmit={(event) => {
          event.preventDefault();
          if (value.defaultInterviewDuration < 10 || value.defaultInterviewDuration > 120) return;
          onSave(value);
        }}
      >
        <div>
          <p className="eyebrow">Profile & settings</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em]">
            Make each interview feel more like yours.
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            These values prefill future interview setup. You can always change them for an
            individual session.
          </p>
        </div>
        <section className="grid gap-4 rounded-3xl border border-border bg-card/55 p-5 sm:grid-cols-2">
          <Field label="Preferred name">
            <Input
              value={value.preferredName ?? ""}
              maxLength={160}
              onChange={(event) => update("preferredName", event.target.value || null)}
            />
          </Field>
          <Field label="Profession">
            <Input
              value={value.profession ?? ""}
              maxLength={160}
              onChange={(event) => update("profession", event.target.value || null)}
            />
          </Field>
          <Field label="Target role">
            <Input
              value={value.targetRole ?? ""}
              maxLength={160}
              onChange={(event) => update("targetRole", event.target.value || null)}
            />
          </Field>
          <Field label="Seniority">
            <Input
              value={value.seniority ?? ""}
              maxLength={160}
              placeholder="e.g. Mid-level"
              onChange={(event) => update("seniority", event.target.value || null)}
            />
          </Field>
          <Field label="Years of experience">
            <Input
              type="number"
              min={0}
              max={80}
              value={value.yearsOfExperience ?? ""}
              onChange={(event) =>
                update("yearsOfExperience", event.target.value ? Number(event.target.value) : null)
              }
            />
          </Field>
          <Field label="Interview language">
            <Input
              value={value.preferredLanguage}
              minLength={2}
              maxLength={10}
              onChange={(event) => update("preferredLanguage", event.target.value)}
            />
          </Field>
        </section>
        <section className="grid gap-4 rounded-3xl border border-border bg-card/55 p-5 sm:grid-cols-3">
          <Field label="Default duration">
            <Input
              type="number"
              min={10}
              max={120}
              value={value.defaultInterviewDuration}
              onChange={(event) => update("defaultInterviewDuration", Number(event.target.value))}
            />
          </Field>
          <Field label="Default difficulty">
            <select
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
              value={value.defaultDifficulty}
              onChange={(event) =>
                update("defaultDifficulty", event.target.value as Profile["defaultDifficulty"])
              }
            >
              {["EASY", "MEDIUM", "HARD", "EXPERT"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field label="Voice preference">
            <Input
              value={value.voicePreference ?? ""}
              maxLength={80}
              placeholder="e.g. Calm"
              onChange={(event) => update("voicePreference", event.target.value || null)}
            />
          </Field>
        </section>
        <section className="rounded-3xl border border-border bg-card/55 p-5">
          <h2 className="text-lg font-semibold">Accessibility</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(
              [
                ["captions", "Prefer captions"],
                ["reduceMotion", "Reduce motion"],
                ["highContrast", "High contrast"],
                ["keyboardNavigation", "Keyboard-first navigation"],
              ] as const
            ).map(([key, label]) => (
              <label className="flex items-center gap-3 text-sm" key={key}>
                <input
                  checked={value.accessibilityPreferences[key]}
                  type="checkbox"
                  onChange={(event) =>
                    update("accessibilityPreferences", {
                      ...value.accessibilityPreferences,
                      [key]: event.target.checked,
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </section>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button disabled={saving} type="submit">
          <Save className="size-4" />
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </form>
    </main>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}
