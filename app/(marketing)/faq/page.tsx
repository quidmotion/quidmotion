import type { Metadata } from "next";
import { listFaq, listCategories } from "@/lib/services/faq";
import { FaqClient } from "@/components/marketing/FaqClient";

export const metadata: Metadata = { title: "FAQ" };

export default function FaqPage() {
  const entries = listFaq();
  const categories = listCategories();
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-semibold tracking-tight">FAQ</h1>
      <p className="mt-3 text-white/60">
        Answers about getting started, crypto payments, returns, security, and
        legal.
      </p>
      <div className="mt-10">
        <FaqClient entries={entries} categories={categories} />
      </div>
    </div>
  );
}
