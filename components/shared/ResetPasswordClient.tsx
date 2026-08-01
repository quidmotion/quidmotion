"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Island, IslandBody } from "@/components/ui/Island";
import { resetPasswordAction, type ActionResult } from "@/lib/actions/auth";

export function ResetPasswordClient({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    resetPasswordAction,
    null as ActionResult | null,
  );

  return (
    <Island className="mx-auto w-full max-w-md">
      <IslandBody className="pt-8">
        <h1 className="text-2xl font-semibold">Choose a new password</h1>
        <form action={formAction} className="mt-6 space-y-4">
          <input type="hidden" name="token" value={token} />
          <div>
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          {state && !state.ok ? (
            <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending || !token}>
            {pending ? "Saving…" : "Update password"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-white/45">
          <Link href="/login" className="text-violet-300">
            Back to login
          </Link>
        </p>
      </IslandBody>
    </Island>
  );
}
