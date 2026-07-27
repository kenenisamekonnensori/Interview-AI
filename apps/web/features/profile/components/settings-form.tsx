"use client";

import { Save } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiClient } from "@/lib/api-client";

type Settings = {
  preferredLanguage: string;
  defaultInterviewDuration: number;
  defaultDifficulty: "EASY" | "MEDIUM" | "HARD" | "EXPERT";
  accessibilityPreferences: {
    captions: boolean;
    reduceMotion: boolean;
    highContrast: boolean;
    keyboardNavigation: boolean;
  };
};
export function SettingsForm() {
  const client = useQueryClient();
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => apiClient<{ profile: Settings }>("/api/v1/profile"),
  });
  const save = useMutation({
    mutationFn: (body: Settings) => apiClient("/api/v1/profile", { method: "PUT", body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["profile"] }),
  });
  if (!profile.data)
    return <main className="p-8 text-sm text-muted-foreground">Loading settings…</main>;
  return <Editor initial={profile.data.profile} saving={save.isPending} onSave={save.mutate} />;
}
function Editor({
  initial,
  saving,
  onSave,
}: {
  initial: Settings;
  saving: boolean;
  onSave: (value: Settings) => void;
}) {
  const [value, setValue] = useState(initial);
  const accessibility = (key: "captions" | "reduceMotion", checked: boolean) =>
    setValue((current) => ({
      ...current,
      accessibilityPreferences: { ...current.accessibilityPreferences, [key]: checked },
    }));
  return (
    <main className="noise min-h-[calc(100vh-5rem)] px-5 py-8 sm:px-8 lg:px-10">
      <form
        className="mx-auto max-w-3xl space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(value);
        }}
      >
        <div>
          <p className="eyebrow">Settings</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em]">
            Make the product work your way.
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            These preferences affect presentation and prefill future interviews. They never override
            a custom interview choice.
          </p>
        </div>
        <section className="surface p-5">
          <h2 className="font-semibold">Appearance</h2>
          <p className="mt-2 text-sm text-muted-foreground">Color theme applies on this device.</p>
          <div className="mt-3">
            <ThemeToggle />
          </div>
        </section>
        <section className="surface p-5">
          <h2 className="font-semibold">Accessibility and transcripts</h2>
          <div className="mt-4 space-y-3 text-sm">
            {(
              [
                ["captions", "Keep interview transcripts visible"],
                ["reduceMotion", "Reduce interface motion"],
              ] as const
            ).map(([key, label]) => (
              <label className="flex items-center gap-3" key={key}>
                <input
                  checked={value.accessibilityPreferences[key]}
                  type="checkbox"
                  onChange={(event) => accessibility(key, event.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
        </section>
        <section className="surface grid gap-4 p-5 sm:grid-cols-3">
          <h2 className="sm:col-span-3 font-semibold">Interview defaults</h2>
          <label className="text-sm">
            Interview language
            <select
              className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3"
              value={value.preferredLanguage}
              onChange={(event) => setValue({ ...value, preferredLanguage: event.target.value })}
            >
              <option value="en">English</option>
            </select>
            <span className="mt-1 block text-xs text-muted-foreground">
              English is currently the supported live voice language and prefills future interviews.
            </span>
          </label>
          <label className="text-sm">
            Duration
            <select
              className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3"
              value={value.defaultInterviewDuration}
              onChange={(event) =>
                setValue({ ...value, defaultInterviewDuration: Number(event.target.value) })
              }
            >
              {[15, 30, 45, 60].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutes
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Difficulty
            <select
              className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3"
              value={value.defaultDifficulty}
              onChange={(event) =>
                setValue({
                  ...value,
                  defaultDifficulty: event.target.value as Settings["defaultDifficulty"],
                })
              }
            >
              {["EASY", "MEDIUM", "HARD", "EXPERT"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </section>
        <Button disabled={saving} type="submit">
          <Save className="size-4" />
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </form>
    </main>
  );
}
