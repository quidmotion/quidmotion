"use server";

import { revalidatePath } from "next/cache";
import { getAuth } from "@/lib/auth";
import { isAppError } from "@/lib/errors";
import { toCents } from "@/lib/money";
import * as kyc from "@/lib/services/kyc";
import * as payouts from "@/lib/services/payouts";
import * as users from "@/lib/services/users";
import * as documents from "@/lib/services/documents";
import * as settings from "@/lib/services/settings";
import * as properties from "@/lib/services/properties";
import * as cryptoSvc from "@/lib/services/crypto";
import * as growth from "@/lib/services/growth";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

async function requireAdmin() {
  const session = await getAuth().getSession();
  if (!session || session.user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return session.user;
}

function fail(e: unknown): ActionResult {
  return {
    ok: false,
    error: isAppError(e)
      ? e.message
      : e instanceof Error
        ? e.message
        : "Action failed",
  };
}

/** Supports both form action (FormData) and useActionState (prev, FormData). */
function asFormData(a: unknown, b?: unknown): FormData {
  if (a instanceof FormData) return a;
  if (b instanceof FormData) return b;
  throw new Error("Expected FormData");
}

export async function reviewKycAction(
  prevOrForm: ActionResult | null | FormData,
  maybeForm?: FormData,
): Promise<void> {
  try {
    const formData = asFormData(prevOrForm, maybeForm);
    const admin = await requireAdmin();
    const id = String(formData.get("id"));
    const decision = String(formData.get("decision")) as "approved" | "rejected";
    const note = String(formData.get("note") ?? "") || undefined;
    await kyc.review(admin.id, id, decision, note);
    revalidatePath("/admin/kyc");
    revalidatePath("/admin/users");
    revalidatePath("/dashboard/settings");
  } catch (e) {
    console.error("[reviewKycAction]", fail(e));
  }
}

export async function reviewPayoutAction(
  prevOrForm: ActionResult | null | FormData,
  maybeForm?: FormData,
): Promise<void> {
  try {
    const formData = asFormData(prevOrForm, maybeForm);
    const admin = await requireAdmin();
    const id = String(formData.get("id"));
    const decision = String(formData.get("decision"));
    if (decision === "approve") {
      payouts.approve(admin.id, id);
    } else if (decision === "complete") {
      await payouts.completePayout(
        admin.id,
        id,
        String(formData.get("note") ?? "") || undefined,
      );
    } else if (decision === "reject") {
      payouts.reject(
        admin.id,
        id,
        String(formData.get("note") ?? "Rejected by admin") || undefined,
      );
    }
    revalidatePath("/admin/payouts");
    revalidatePath("/dashboard/withdraw");
  } catch (e) {
    console.error("[reviewPayoutAction]", fail(e));
  }
}

export async function setUserStatusAction(
  prevOrForm: ActionResult | null | FormData,
  maybeForm?: FormData,
): Promise<void> {
  try {
    const formData = asFormData(prevOrForm, maybeForm);
    const admin = await requireAdmin();
    users.setUserStatus(
      admin.id,
      String(formData.get("userId")),
      String(formData.get("status")) as "active" | "suspended",
    );
    revalidatePath("/admin/users");
  } catch (e) {
    console.error("[setUserStatusAction]", fail(e));
  }
}

export async function updateDocAction(
  prevOrForm: ActionResult | null | FormData,
  maybeForm?: FormData,
): Promise<void> {
  try {
    const formData = asFormData(prevOrForm, maybeForm);
    const admin = await requireAdmin();
    documents.updateContent(
      admin.id,
      String(formData.get("slug")),
      String(formData.get("body")),
    );
    revalidatePath("/admin/content");
    revalidatePath("/documents");
  } catch (e) {
    console.error("[updateDocAction]", fail(e));
  }
}

export async function updateDepositWalletsAction(
  prevOrForm: ActionResult | null | FormData,
  maybeForm?: FormData,
): Promise<void> {
  try {
    const formData = asFormData(prevOrForm, maybeForm);
    const admin = await requireAdmin();
    const wallets = settings.DEPOSIT_ASSETS.map((asset) => ({
      asset,
      address: String(formData.get(`address_${asset}`) ?? ""),
      network: String(formData.get(`network_${asset}`) ?? ""),
    }));
    settings.updateDepositWallets(admin.id, wallets);
    revalidatePath("/admin/settings");
    revalidatePath("/dashboard/deposit");
  } catch (e) {
    console.error("[updateDepositWalletsAction]", fail(e));
  }
}

export async function updateOfficialEmailsAction(
  prevOrForm: ActionResult | null | FormData,
  maybeForm?: FormData,
): Promise<void> {
  try {
    const formData = asFormData(prevOrForm, maybeForm);
    const admin = await requireAdmin();
    settings.updateOfficialEmails(admin.id, {
      contact: String(formData.get("email_contact") ?? ""),
      support: String(formData.get("email_support") ?? ""),
      noreply: String(formData.get("email_noreply") ?? ""),
    });
    revalidatePath("/admin/settings");
  } catch (e) {
    console.error("[updateOfficialEmailsAction]", fail(e));
  }
}

export async function createPropertyAction(
  prevOrForm: ActionResult | null | FormData,
  maybeForm?: FormData,
): Promise<void> {
  try {
    const formData = asFormData(prevOrForm, maybeForm);
    const admin = await requireAdmin();
    const expectedApyPct = Number(formData.get("expectedApyPct"));
    const targetRaiseUsd = Number(formData.get("targetRaiseUsd"));
    const raisedUsd = Number(formData.get("raisedUsd") ?? 0);
    properties.createProperty(admin.id, {
      name: String(formData.get("name") ?? ""),
      location: String(formData.get("location") ?? ""),
      description: String(formData.get("description") ?? ""),
      imageUrl: String(formData.get("imageUrl") ?? "") || undefined,
      targetRaiseCents: toCents(targetRaiseUsd),
      raisedCents: toCents(raisedUsd || 0),
      expectedApyBps: Math.round(expectedApyPct * 100),
      status: (String(formData.get("status") ?? "live") as
        | "draft"
        | "live"
        | "funded"
        | "closed"),
      featured: formData.get("featured") !== "false",
    });
    revalidatePath("/admin/properties");
    revalidatePath("/dashboard/properties");
    revalidatePath("/dashboard");
  } catch (e) {
    console.error("[createPropertyAction]", fail(e));
  }
}

export async function updatePropertyAction(
  prevOrForm: ActionResult | null | FormData,
  maybeForm?: FormData,
): Promise<void> {
  try {
    const formData = asFormData(prevOrForm, maybeForm);
    const admin = await requireAdmin();
    const id = String(formData.get("id"));
    const patch: Parameters<typeof properties.updateProperty>[2] = {};
    if (formData.get("name")) patch.name = String(formData.get("name"));
    if (formData.get("location"))
      patch.location = String(formData.get("location"));
    if (formData.get("description"))
      patch.description = String(formData.get("description"));
    if (formData.get("expectedApyPct")) {
      patch.expectedApyBps = Math.round(
        Number(formData.get("expectedApyPct")) * 100,
      );
    }
    if (formData.get("targetRaiseUsd")) {
      patch.targetRaiseCents = toCents(Number(formData.get("targetRaiseUsd")));
    }
    if (formData.get("raisedUsd")) {
      patch.raisedCents = toCents(Number(formData.get("raisedUsd")));
    }
    if (formData.get("status")) {
      patch.status = String(formData.get("status")) as
        | "draft"
        | "live"
        | "funded"
        | "closed";
    }
    if (formData.get("featured") != null) {
      patch.featured = formData.get("featured") === "true";
    }
    properties.updateProperty(admin.id, id, patch);
    revalidatePath("/admin/properties");
    revalidatePath("/dashboard/properties");
  } catch (e) {
    console.error("[updatePropertyAction]", fail(e));
  }
}

export async function reviewDepositAction(
  prevOrForm: ActionResult | null | FormData,
  maybeForm?: FormData,
): Promise<void> {
  try {
    const formData = asFormData(prevOrForm, maybeForm);
    const admin = await requireAdmin();
    const id = String(formData.get("id"));
    const decision = String(formData.get("decision"));
    const note = String(formData.get("note") ?? "") || undefined;
    if (decision === "confirm") {
      await cryptoSvc.adminConfirmDeposit(admin.id, id, note);
    } else if (decision === "reject") {
      await cryptoSvc.adminRejectDeposit(
        admin.id,
        id,
        note ?? "Deposit not verified",
      );
    }
    revalidatePath("/admin/deposits");
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/deposit");
    revalidatePath("/dashboard/transactions");
  } catch (e) {
    console.error("[reviewDepositAction]", fail(e));
  }
}

export async function refreshPricesAction(_formData?: FormData): Promise<void> {
  try {
    const admin = await requireAdmin();
    await cryptoSvc.adminRefreshPrices(admin.id);
    revalidatePath("/admin/settings");
    revalidatePath("/dashboard/deposit");
  } catch (e) {
    console.error("[refreshPricesAction]", fail(e));
  }
}

export async function runGrowthAccrualAction(
  _formData?: FormData,
): Promise<void> {
  try {
    await requireAdmin();
    growth.accrueAllUsersGrowth();
    revalidatePath("/dashboard");
    revalidatePath("/admin/settings");
  } catch (e) {
    console.error("[runGrowthAccrualAction]", fail(e));
  }
}

export async function updateApyRulesAction(
  prevOrForm: ActionResult | null | FormData,
  maybeForm?: FormData,
): Promise<void> {
  try {
    const formData = asFormData(prevOrForm, maybeForm);
    const admin = await requireAdmin();
    const rates = growth.listDefaultPortfolioRates();
    const tiers = rates.map((r) => ({
      tier: r.tier,
      currentApyPct: Number(formData.get(`current_${r.tier}`) ?? r.currentApyBps / 100),
      minApyPct: Number(formData.get(`min_${r.tier}`) ?? r.apyMinBps / 100),
      maxApyPct: Number(formData.get(`max_${r.tier}`) ?? r.apyMaxBps / 100),
    }));
    const lockups = [
      { days: 90, multiplierPct: Number(formData.get("mult_90") ?? 33) },
      { days: 180, multiplierPct: Number(formData.get("mult_180") ?? 66) },
      { days: 365, multiplierPct: Number(formData.get("mult_365") ?? 100) },
    ];
    growth.updateApyRules(admin.id, tiers, lockups);
    revalidatePath("/admin/settings");
    revalidatePath("/dashboard/investments");
    revalidatePath("/dashboard");
  } catch (e) {
    console.error("[updateApyRulesAction]", fail(e));
  }
}
