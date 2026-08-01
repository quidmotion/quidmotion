"use server";

import { revalidatePath } from "next/cache";
import { getAuth } from "@/lib/auth";
import { isAppError } from "@/lib/errors";
import { toCents } from "@/lib/money";
import * as cryptoSvc from "@/lib/services/crypto";
import * as investments from "@/lib/services/investments";
import * as payouts from "@/lib/services/payouts";
import * as kyc from "@/lib/services/kyc";
import * as leads from "@/lib/services/leads";

export type ActionResult =
  | { ok: true; message?: string; error?: undefined }
  | { ok: false; error: string };

/** @deprecated prefer ActionResult — kept for form helpers that check res.error */
type Result = { error?: string; ok?: boolean; message?: string };

async function requireUser() {
  const session = await getAuth().getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session.user;
}

function fail(e: unknown): Result {
  return {
    error: isAppError(e)
      ? e.message
      : e instanceof Error
        ? e.message
        : "Request failed",
  };
}

/**
 * User reports a deposit. Funds are NOT credited until an admin confirms.
 */
export async function depositAction(
  amountUsd: number,
  asset: string,
  txRef?: string,
): Promise<Result> {
  try {
    const user = await requireUser();
    await cryptoSvc.requestDeposit(user.id, {
      asset,
      amountUsd,
      txRef,
    });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/deposit");
    revalidatePath("/dashboard/transactions");
    revalidatePath("/admin/deposits");
    return {
      ok: true,
      message:
        "Deposit submitted for admin confirmation. You will be notified when credited.",
    };
  } catch (e) {
    return fail(e);
  }
}

/** @deprecated use depositAction */
export async function simulateDepositAction(
  amountUsd: number,
  asset: string,
): Promise<Result> {
  return depositAction(amountUsd, asset);
}

/** Forms call with (planId, amountUsd). */
export async function subscribeAction(
  planId: string,
  amountUsd: number,
): Promise<Result> {
  try {
    const user = await requireUser();
    await investments.createInvestment(user.id, {
      planId,
      amountCents: toCents(amountUsd),
    });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/investments");
    revalidatePath("/dashboard/transactions");
    return { ok: true, message: "Investment committed." };
  } catch (e) {
    return fail(e);
  }
}

/** Withdraw with destination address (KYC required). */
export async function withdrawAction(
  amountUsd: number,
  withdrawalAddress: string,
  asset = "USDT",
  network?: string,
): Promise<Result> {
  try {
    const user = await requireUser();
    await payouts.requestWithdrawal(user.id, {
      amountCents: toCents(amountUsd),
      withdrawalAddress,
      asset,
      network,
    });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/withdraw");
    revalidatePath("/dashboard/transactions");
    return {
      ok: true,
      message: "Withdrawal submitted — pending approval.",
    };
  } catch (e) {
    return fail(e);
  }
}

/** Live KYC submission with identity fields + uploaded document paths. */
export async function submitKycAction(formData: FormData): Promise<Result> {
  try {
    const user = await requireUser();

    const fullLegalName = String(formData.get("fullLegalName") ?? "");
    const dateOfBirth = String(formData.get("dateOfBirth") ?? "");
    const country = String(formData.get("country") ?? "");
    const documentType = String(formData.get("documentType") ?? "");
    const documentNumber = String(formData.get("documentNumber") ?? "");

    const paths: string[] = [];
    const fileFields = ["docFront", "docBack", "docSelfie"] as const;
    for (const field of fileFields) {
      const file = formData.get(field);
      if (file && typeof file === "object" && "arrayBuffer" in file) {
        const f = file as File;
        if (f.size > 0) {
          if (f.size > 8 * 1024 * 1024) {
            return { error: `${field} exceeds 8MB limit` };
          }
          const buf = Buffer.from(await f.arrayBuffer());
          const rel = kyc.saveKycFile(user.id, f.name || `${field}.bin`, buf);
          paths.push(rel);
        }
      }
    }

    await kyc.submit(user.id, {
      fullLegalName,
      dateOfBirth,
      country,
      documentType,
      documentNumber,
      documentPaths: paths,
    });

    revalidatePath("/dashboard/settings");
    revalidatePath("/admin/kyc");
    return { ok: true, message: "KYC submitted for review." };
  } catch (e) {
    return fail(e);
  }
}

export async function leadCaptureAction(email: string): Promise<Result> {
  try {
    await leads.captureLead(email, "guide");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
