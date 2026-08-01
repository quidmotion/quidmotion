"use client";

import { useMemo, useState } from "react";
import { Island, IslandBody } from "@/components/ui/Island";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";

type Entry = {
  id: string;
  category: string;
  question: string;
  answer: string;
};

export function FaqClient({
  entries,
  categories,
}: {
  entries: Entry[];
  categories: string[];
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("All");
  const [open, setOpen] = useState<string | null>(entries[0]?.id ?? null);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (cat !== "All" && e.category !== cat) return false;
      if (!q) return true;
      const s = q.toLowerCase();
      return (
        e.question.toLowerCase().includes(s) ||
        e.answer.toLowerCase().includes(s)
      );
    });
  }, [entries, q, cat]);

  return (
    <div>
      <Input
        placeholder="Search questions..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-4"
      />
      <div className="mb-6 flex flex-wrap gap-2">
        {["All", ...categories].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition",
              cat === c
                ? "bg-violet-500/20 text-violet-200"
                : "bg-white/5 text-white/50 hover:bg-white/10",
            )}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {filtered.map((e) => {
          const isOpen = open === e.id;
          return (
            <Island key={e.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-5 py-4 text-left"
                onClick={() => setOpen(isOpen ? null : e.id)}
              >
                <span className="pr-4 font-medium">{e.question}</span>
                <span className="text-white/40">{isOpen ? "−" : "+"}</span>
              </button>
              {isOpen && (
                <IslandBody className="border-t border-white/5 pt-0">
                  <p className="pb-1 text-sm leading-relaxed text-white/55">
                    {e.answer}
                  </p>
                  <div className="mt-2 text-[10px] uppercase tracking-wide text-white/30">
                    {e.category}
                  </div>
                </IslandBody>
              )}
            </Island>
          );
        })}
        {!filtered.length && (
          <p className="py-8 text-center text-sm text-white/40">No matches.</p>
        )}
      </div>
    </div>
  );
}
