"use client";

import { useTransition } from "react";
import { LOCKUP_OPTIONS } from "@/lib/constants";

export function LockupSelector({
  currentLockupDays,
  changeLockupAction,
}: {
  currentLockupDays: number;
  changeLockupAction: (formData: FormData) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  const isMax = currentLockupDays >= 365;

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-medium text-white/90">Portfolio Lock-up Period</span>
          <p className="text-xs text-white/45">
            Increase lock-up tier to boost your effective APY share (33% → 66% → 100%).
          </p>
        </div>
        <form
          action={(formData) => {
            startTransition(async () => {
              await changeLockupAction(formData);
            });
          }}
          className="flex items-center gap-2"
        >
          <select
            name="lockupDays"
            defaultValue={currentLockupDays}
            disabled={isPending || isMax}
            className="rounded-lg border border-white/10 bg-gray-900 px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
          >
            {LOCKUP_OPTIONS.map((days) => {
              const isDisabled = days < currentLockupDays;
              const multLabel =
                days === 90
                  ? "33% APY share"
                  : days === 180
                    ? "66% APY share"
                    : "100% APY share";
              return (
                <option key={days} value={days} disabled={isDisabled}>
                  {days} Days ({multLabel})
                </option>
              );
            })}
          </select>
          {!isMax && (
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {isPending ? "Updating..." : "Update"}
            </button>
          )}
        </form>
      </div>
      {isMax && (
        <p className="mt-2 text-xs text-emerald-400 font-medium">
          ✓ Maximum 365-day lock-up tier active (100% APY share unlocked).
        </p>
      )}
    </div>
  );
}
