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
import { type SignUpValues, signUpSchema } from "@/features/auth/schemas";

import { GoogleButton } from "./google-button";

export function SignUpForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const form = useForm<SignUpValues>({
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  async function onSubmit(values: SignUpValues) {
    setServerError("");
    const parsedValues = signUpSchema.safeParse(values);

    if (!parsedValues.success) {
      parsedValues.error.issues.forEach((issue) => {
        form.setError(issue.path[0] as keyof SignUpValues, { message: issue.message });
      });
      return;
    }

    const signupValues = {
      name: parsedValues.data.name,
      email: parsedValues.data.email,
      password: parsedValues.data.password,
    };
    const result = await authClient.signUp.email({
      ...signupValues,
      callbackURL: `${window.location.origin}/verify-email`,
    });

    if (result.error) {
      setServerError(result.error.message ?? "Unable to create your account. Please try again.");
      return;
    }

    router.replace(`/verify-email?email=${encodeURIComponent(signupValues.email)}`);
  }

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm font-medium text-primary">Start practicing</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">Create your account.</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">A focused practice space is one step away.</p>
      </div>

      <GoogleButton onError={setServerError} />
      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">or create with email</div>

      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input autoComplete="name" id="name" placeholder="Your name" {...form.register("name")} />
          {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input autoComplete="email" id="email" placeholder="you@example.com" type="email" {...form.register("email")} />
          {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input autoComplete="new-password" id="password" placeholder="At least 12 characters" type="password" {...form.register("password")} />
          {form.formState.errors.password && <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm password</Label>
          <Input autoComplete="new-password" id="confirm-password" placeholder="Repeat your password" type="password" {...form.register("confirmPassword")} />
          {form.formState.errors.confirmPassword && <p className="text-xs text-destructive">{form.formState.errors.confirmPassword.message}</p>}
        </div>
        {serverError && <p aria-live="polite" className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{serverError}</p>}
        <Button className="w-full" disabled={form.formState.isSubmitting} size="lg" type="submit">
          {form.formState.isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}
          Create account
        </Button>
      </form>

      <p className="mt-7 text-center text-sm text-muted-foreground">
        Already have an account? <Link className="font-medium text-primary hover:underline" href="/sign-in">Sign in</Link>
      </p>
    </div>
  );
}
