"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { type SignInValues, signInSchema } from "@/features/auth/schemas";

import { GoogleButton } from "./google-button";

export function SignInForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const form = useForm<SignInValues>({
    defaultValues: { email: "", password: "", rememberMe: true },
  });

  async function onSubmit(values: SignInValues) {
    setServerError("");
    const parsedValues = signInSchema.safeParse(values);

    if (!parsedValues.success) {
      parsedValues.error.issues.forEach((issue) => {
        form.setError(issue.path[0] as keyof SignInValues, { message: issue.message });
      });
      return;
    }

    const result = await authClient.signIn.email({
      ...parsedValues.data,
      callbackURL: `${window.location.origin}/dashboard`,
    });

    if (result.error) {
      setServerError(result.error.message ?? "Unable to sign in. Check your details and try again.");
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm font-medium text-primary">Welcome back</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">Continue your practice.</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Sign in to return to your interview workspace.</p>
      </div>

      <GoogleButton onError={setServerError} />
      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">or continue with email</div>

      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input autoComplete="email" id="email" placeholder="you@example.com" type="email" {...form.register("email")} />
          {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input autoComplete="current-password" id="password" placeholder="Your password" type="password" {...form.register("password")} />
          {form.formState.errors.password && <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input className="size-4 rounded border-input accent-primary" type="checkbox" {...form.register("rememberMe")} />
          Keep me signed in
        </label>
        {serverError && <p aria-live="polite" className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{serverError}</p>}
        <Button className="w-full" disabled={form.formState.isSubmitting} size="lg" type="submit">
          {form.formState.isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}
          Sign in
        </Button>
      </form>

      <p className="mt-7 text-center text-sm text-muted-foreground">
        New to Interviewer AI? <Link className="font-medium text-primary hover:underline" href="/sign-up">Create an account</Link>
      </p>
    </div>
  );
}
