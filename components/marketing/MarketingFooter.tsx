import Link from "next/link";
import { siteConfig } from "@/lib/config/site";

export function MarketingFooter() {
  return (
    <footer className="border-t border-white/10 bg-black/30">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="mb-3 flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 text-sm font-bold">
              Q
            </span>
            {siteConfig.name}
          </div>
          <p className="max-w-sm text-sm text-white/50">{siteConfig.description}</p>
        </div>
        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
            Product
          </h4>
          <ul className="space-y-2 text-sm text-white/70">
            {siteConfig.nav.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="hover:text-white">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
            Legal
          </h4>
          <ul className="space-y-2 text-sm text-white/70">
            <li>
              <Link href="/documents/terms" className="hover:text-white">
                Terms
              </Link>
            </li>
            <li>
              <Link href="/documents/privacy" className="hover:text-white">
                Privacy
              </Link>
            </li>
            <li>
              <Link href="/documents/risk-disclosure" className="hover:text-white">
                Risk Disclosure
              </Link>
            </li>
            <li>
              <Link href="/documents/aml-kyc" className="hover:text-white">
                AML / KYC
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/5 py-4 text-center text-xs text-white/35">
        © {new Date().getFullYear()} {siteConfig.name}. Real Estate — Power of Cyptocurrency. All rights reserved.
      </div>
    </footer>
  );
}
