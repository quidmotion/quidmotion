/** Instant shell while dashboard route RSC data loads (tab switches). */
export default function DashboardLoading() {
  return (
    <div className="w-full min-w-0 max-w-full animate-pulse space-y-3 pb-4 sm:space-y-4 sm:pb-8">
      <div className="space-y-2 px-0.5 sm:px-1">
        <div className="h-7 w-48 rounded-lg bg-white/10" />
        <div className="h-4 w-72 max-w-full rounded bg-white/5" />
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-12">
        <div className="min-w-0 space-y-4 lg:col-span-8">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="h-3 w-24 rounded bg-white/10" />
            <div className="mt-3 h-10 w-40 rounded-lg bg-white/10" />
            <div className="mt-3 h-5 w-28 rounded bg-white/5" />
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="h-4 w-32 rounded bg-white/10" />
            <div className="mt-4 h-44 rounded-xl bg-white/5 sm:h-52" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="h-36 rounded-2xl border border-white/10 bg-white/5" />
            <div className="h-36 rounded-2xl border border-white/10 bg-white/5" />
          </div>
        </div>
        <div className="min-w-0 space-y-4 lg:col-span-4">
          <div className="h-40 rounded-2xl border border-white/10 bg-white/5" />
          <div className="h-48 rounded-2xl border border-white/10 bg-white/5" />
          <div className="h-52 rounded-2xl border border-white/10 bg-white/5" />
        </div>
      </div>
    </div>
  );
}
