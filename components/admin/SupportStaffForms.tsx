"use client";

import { useActionState } from "react";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  createSupportStaffAction,
  type ActionResult,
} from "@/lib/actions/admin";

export function SupportStaffForms({ mode }: { mode: "create" }) {
  const [state, formAction, pending] = useActionState(
    createSupportStaffAction,
    null as ActionResult | null,
  );

  if (mode !== "create") return null;

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor="name">Full name</Label>
        <Input id="name" name="name" required autoComplete="name" />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
        />
      </div>
      {state && !state.ok && (
        <p className="sm:col-span-2 text-sm text-red-300">{state.error}</p>
      )}
      {state?.ok && (
        <p className="sm:col-span-2 text-sm text-emerald-300">
          {state.message ?? "Created"}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create support account"}
        </Button>
      </div>
    </form>
  );
}
