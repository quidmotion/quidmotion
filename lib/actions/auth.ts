"use server";

import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { isAppError } from "@/lib/errors";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Next.js control-flow errors must not be swallowed by try/catch. */
function rethrowIfNextControlFlow(e: unknown): void {
  if (
    e &&
    typeof e === "object" &&
    "digest" in e &&
    typeof (e as { digest?: unknown }).digest === "string" &&
    String((e as { digest: string }).digest).startsWith("NEXT_")
  ) {
    throw e;
  }
}

/**
 * useActionState calls (prevState, formData).
 * Progressive enhancement / some encoders may pass FormData as the sole arg.
 */
function resolveFormData(
  prevOrFormData: ActionResult | null | FormData | undefined,
  maybeFormData?: FormData,
): FormData {
  if (prevOrFormData instanceof FormData) return prevOrFormData;
  if (maybeFormData instanceof FormData) return maybeFormData;
  throw new Error("Invalid form submission");
}

function actionError(e: unknown, fallback: string): ActionResult {
  rethrowIfNextControlFlow(e);
  console.error("[auth action]", e);
  if (isAppError(e)) return { ok: false, error: e.message };
  if (e instanceof Error && e.message) return { ok: false, error: e.message };
  return { ok: false, error: fallback };
}

export async function loginAction(
  prevOrFormData: ActionResult | null | FormData,
  maybeFormData?: FormData,
): Promise<ActionResult> {
  let formData: FormData;
  try {
    formData = resolveFormData(prevOrFormData, maybeFormData);
  } catch (e) {
    return actionError(e, "Invalid form submission");
  }

  try {
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    if (!email || !password) {
      return { ok: false, error: "Email and password are required" };
    }
    await getAuth().login({ email, password });
  } catch (e) {
    return actionError(e, "Login failed");
  }

  const session = await getAuth().getSession();
  const rawNext = String(formData.get("next") ?? "");
  let next = rawNext.startsWith("/") ? rawNext : "";
  if (!next) {
    next =
      session?.user.role === "admin" || session?.user.role === "support"
        ? "/admin"
        : "/dashboard";
  }
  // Support staff should land in admin when next is generic dashboard
  if (
    (session?.user.role === "support" || session?.user.role === "admin") &&
    (next === "/dashboard" || next === "/")
  ) {
    next = "/admin";
  }
  redirect(next);
}

export async function registerAction(
  prevOrFormData: ActionResult | null | FormData,
  maybeFormData?: FormData,
): Promise<ActionResult> {
  let formData: FormData;
  try {
    formData = resolveFormData(prevOrFormData, maybeFormData);
  } catch (e) {
    return actionError(e, "Invalid form submission");
  }

  try {
    await getAuth().register({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      name: String(formData.get("name") ?? ""),
      referralCode: String(formData.get("referralCode") ?? "") || undefined,
    });
  } catch (e) {
    return actionError(e, "Registration failed");
  }
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await getAuth().logout();
  redirect("/");
}

export async function forgotPasswordAction(
  prevOrFormData: ActionResult | null | FormData,
  maybeFormData?: FormData,
): Promise<ActionResult> {
  let formData: FormData;
  try {
    formData = resolveFormData(prevOrFormData, maybeFormData);
  } catch (e) {
    return actionError(e, "Invalid form submission");
  }

  try {
    await getAuth().requestPasswordReset(String(formData.get("email") ?? ""));
    return { ok: true };
  } catch (e) {
    return actionError(e, "Request failed");
  }
}

export async function resetPasswordAction(
  prevOrFormData: ActionResult | null | FormData,
  maybeFormData?: FormData,
): Promise<ActionResult> {
  let formData: FormData;
  try {
    formData = resolveFormData(prevOrFormData, maybeFormData);
  } catch (e) {
    return actionError(e, "Invalid form submission");
  }

  try {
    await getAuth().resetPassword(
      String(formData.get("token") ?? ""),
      String(formData.get("password") ?? ""),
    );
  } catch (e) {
    return actionError(e, "Reset failed");
  }
  redirect("/login");
}
