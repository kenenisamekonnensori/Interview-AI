"use client";

import { ArrowRight, Sparkles } from "lucide-react";

import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { authClient } from "@/lib/auth-client";

export default function DashboardPage() {
  const { data: session } = authClient.useSession();
  const firstName = session?.user.name.split(" ")[0] ?? "there";

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between border-b border-border pb-5">
        <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="size-4" /></span><span className="text-sm font-semibold">Interviewer AI</span></div>
        <SignOutButton />
      </header>
      <section className="grid min-h-[70vh] place-items-center py-12 text-center">
        <div className="max-w-xl">
          <p className="text-sm font-medium text-primary">Your workspace is ready</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Welcome, {firstName}.</h1>
          <p className="mt-5 text-base leading-7 text-muted-foreground">Your account is secure and ready for the next step: creating your first tailored interview practice session.</p>
          <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground"><ArrowRight className="size-4 text-primary" />Interview setup arrives in the next milestone.</div>
        </div>
      </section>
    </main>
  );
}
