"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { submitKycAction } from "@/lib/actions/dashboard";

export function KycForm() {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    start(async () => {
      const res = await submitKycAction(fd);
      if (res.error) setError(res.error);
      else {
        setOk(true);
        form.reset();
      }
    });
  }

  if (ok) {
    return (
      <p className="text-sm text-emerald-400">
        KYC submitted successfully. Status is now <strong>pending</strong> —
        our compliance team will review your documents shortly. You will
        receive an email when a decision is made.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" encType="multipart/form-data">
      <p className="text-sm text-white/50">
        Complete identity verification to invest and withdraw. Upload a
        government-issued photo ID. Files stay on our secure local store until
        migration to production object storage.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="fullLegalName">Full legal name</Label>
          <Input
            id="fullLegalName"
            name="fullLegalName"
            required
            placeholder="As shown on your ID"
            autoComplete="name"
          />
        </div>
        <div>
          <Label htmlFor="dateOfBirth">Date of birth</Label>
          <Input
            id="dateOfBirth"
            name="dateOfBirth"
            type="date"
            required
          />
        </div>
        <div>
          <Label htmlFor="country">Country of residence</Label>
          <Input
            id="country"
            name="country"
            required
            placeholder="United States"
          />
        </div>
        <div>
          <Label htmlFor="documentType">Document type</Label>
          <select
            id="documentType"
            name="documentType"
            required
            className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none"
            defaultValue="passport"
          >
            <option value="passport" className="bg-[#12141c]">
              Passport
            </option>
            <option value="national_id" className="bg-[#12141c]">
              National ID
            </option>
            <option value="drivers_license" className="bg-[#12141c]">
              Driver&apos;s license
            </option>
          </select>
        </div>
        <div>
          <Label htmlFor="documentNumber">Document number</Label>
          <Input
            id="documentNumber"
            name="documentNumber"
            required
            placeholder="ID / passport number"
          />
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-white/8 bg-white/[0.03] p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-white/40">
          Document uploads (max 8MB each)
        </p>
        <div>
          <Label htmlFor="docFront">ID front / passport bio page *</Label>
          <Input
            id="docFront"
            name="docFront"
            type="file"
            accept="image/*,.pdf"
            required
            className="cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-violet-500/20 file:px-3 file:py-1 file:text-xs file:text-violet-200"
          />
        </div>
        <div>
          <Label htmlFor="docBack">ID back (optional)</Label>
          <Input
            id="docBack"
            name="docBack"
            type="file"
            accept="image/*,.pdf"
            className="cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-violet-500/20 file:px-3 file:py-1 file:text-xs file:text-violet-200"
          />
        </div>
        <div>
          <Label htmlFor="docSelfie">Selfie holding ID (optional)</Label>
          <Input
            id="docSelfie"
            name="docSelfie"
            type="file"
            accept="image/*"
            className="cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-violet-500/20 file:px-3 file:py-1 file:text-xs file:text-violet-200"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Submitting…" : "Submit KYC for review"}
      </Button>
    </form>
  );
}
