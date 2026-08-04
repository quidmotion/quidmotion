"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Island, IslandBody } from "@/components/ui/Island";
import type { ActionResult } from "@/lib/actions/auth";

export function AuthForm({
  title,
  subtitle,
  action,
  submitLabel,
  mode,
  next,
}: {
  title: string;
  subtitle?: string;
  action: (
    prev: ActionResult | null | FormData,
    formData?: FormData,
  ) => Promise<ActionResult>;
  submitLabel: string;
  mode: "login" | "register" | "forgot" | "reset";
  next?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <Island className="mx-auto w-full max-w-md">
      <IslandBody className="pt-8">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-2 text-sm text-white/50">{subtitle}</p>
        ) : null}

        <form action={formAction} className="mt-6 space-y-4">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          {mode === "reset" ? (
            <input
              type="hidden"
              name="token"
              value={
                typeof window !== "undefined"
                  ? new URLSearchParams(window.location.search).get("token") ?? ""
                  : ""
              }
            />
          ) : null}

          {mode === "register" ? (
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input id="name" name="name" required autoComplete="name" />
            </div>
          ) : null}

          {mode !== "reset" ? (
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </div>
          ) : null}

          {mode === "login" || mode === "register" || mode === "reset" ? (
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
              />
            </div>
          ) : null}

          {mode === "register" ? (
            <div>
              <Label htmlFor="referralCode">Referral code (optional)</Label>
              <Input id="referralCode" name="referralCode" />
            </div>
          ) : null}

          {state && !state.ok ? (
            <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {state.error}
            </p>
          ) : null}
          {state && state.ok && mode === "forgot" ? (
            <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              If that email exists, a reset link was logged to the server console.
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Please wait…" : submitLabel}
          </Button>
        </form>

        <div className="mt-6 space-y-2 text-center text-sm text-white/45">
          {mode === "login" ? (
            <>
              <p>
                No account?{" "}
                <Link href="/register" className="text-violet-300 hover:text-violet-200">
                  Register
                </Link>
              </p>
              <p>
                <Link
                  href="/forgot-password"
                  className="text-violet-300 hover:text-violet-200"
                >
                  Forgot password?
                </Link>
              </p>
            </>
          ) : null}
          {mode === "register" ? (
            <p>
              Already have an account?{" "}
              <Link href="/login" className="text-violet-300 hover:text-violet-200">
                Log in
              </Link>
            </p>
          ) : null}
          {mode === "forgot" || mode === "reset" ? (
            <p>
              <Link href="/login" className="text-violet-300 hover:text-violet-200">
                Back to login
              </Link>
            </p>
          ) : null}
        </div>

        {mode === "login" ? (
          <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/40">
            example@example.com
            
          </p>
        ) : null}
      </IslandBody>
    </Island>
  );
}
