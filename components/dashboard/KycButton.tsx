"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";

/** Deep-link to full KYC form in settings. */
export function KycButton() {
  return (
    <Link href="/dashboard/settings">
      <Button>Complete KYC verification</Button>
    </Link>
  );
}
