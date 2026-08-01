# QuidMotion — AI Build Prompt (Crypto-Powered Real Estate Investment Platform)


## 1. PROJECT OVERVIEW

Build **QuidMotion**, a multi-page investment platform where a team of experienced real estate professionals uses cryptocurrency rails to let everyday users invest in real estate. The brand promise: institutional-grade real estate expertise + the speed/accessibility of crypto.

**Tone:** confident, premium, trustworthy, modern fintech — not "crypto bro." Think Robinhood/Wealthfront polish meets a boutique real estate fund's credibility.

**Core technical requirement: everything must be modular.** No page, component, or service should be a monolith. Every UI element, data fetch, and business rule should be independently swappable, testable, and reusable.

---

## 2. TECH STACK & ENVIRONMENT STRATEGY

- **Framework:** Next.js (App Router) + TypeScript
- **Styling:** Tailwind CSS + a small design-tokens layer (see §5)
- **Database (final):** Supabase (Postgres + Auth + Storage + Row Level Security)
- **Hosting (final):** Vercel
- **Database (local-first phase):** Everything must run **entirely on local disk first**, with zero dependency on a live Supabase project, so development and testing can happen offline before migration.

### Local-first data layer requirement
Build a **data access layer (DAL)** — a single abstraction (e.g. `/lib/db/index.ts` exporting a `db` client) that every page/component/service calls through. Underneath it, implement two interchangeable adapters behind one interface:

1. **Local adapter (dev default):** SQLite (via `better-sqlite3` or `drizzle-orm` + `libsql`/SQLite driver) stored as a file in `/data/quidmotion.db`, or alternatively a local Postgres via Docker if you want schema parity with Supabase. Prefer **Drizzle ORM** since it supports both SQLite and Postgres with minimal schema rewriting.
2. **Supabase adapter (production):** Same Drizzle schema pointed at a Postgres connection string, using Supabase client for Auth/Storage-specific calls.

Requirements:
- Schema defined **once** in a shared schema file; both adapters read from it.
- An `.env` flag (`DB_PROVIDER=local` | `DB_PROVIDER=supabase`) switches adapters — **no code changes needed to migrate**, only env config.
- Provide a seed script (`/scripts/seed.ts`) that populates local SQLite with realistic fake data: users, investment plans, transactions, documents, admin records.
- Provide a migration script/instructions for exporting local schema + data into Supabase when ready (Drizzle migrations + a data-export/import script).
- Auth should be abstracted the same way: a local mock-auth provider (simple session/cookie + hashed passwords in local DB) for dev, swappable for Supabase Auth in production via the same interface (`/lib/auth/index.ts`).

---

## 3. ARCHITECTURE & MODULARITY RULES

Enforce a strict modular folder structure:

```
/app
  /(marketing)/page.tsx            → Home
  /(marketing)/about/page.tsx
  /(marketing)/plans/page.tsx      → Investment Plans
  /(marketing)/faq/page.tsx
  /(marketing)/documents/page.tsx  → T&Cs, Privacy Policy, etc.
  /login/page.tsx
  /dashboard/...                   → authenticated user dashboard (nested routes per feature)
  /admin/...                       → authenticated admin panel (nested routes per feature)
/components
  /ui/                             → atomic, generic components (Button, Card, Modal, Input, Badge, Tabs...)
  /marketing/                      → page-specific composed sections (Hero, TrustBar, PlanCard, FAQAccordion...)
  /dashboard/                      → widgets (BalanceCard, PortfolioChart, TransactionList, InvestmentTimeline...)
  /admin/                          → admin widgets (UserTable, KYCQueue, PayoutApprovals...)
/lib
  /db/                             → DAL + adapters (local + supabase) + schema
  /auth/                           → auth abstraction
  /services/                       → business logic, one file per domain (investments.ts, users.ts, payouts.ts, documents.ts, crypto.ts)
  /hooks/                          → shared React hooks
  /validators/                     → zod schemas per entity, reused client+server
  /config/                         → design tokens, site config, feature flags
/data                              → local SQLite file lives here (gitignored)
/scripts                           → seed.ts, migrate-to-supabase.ts
```

**Modularity rules for the AI to follow:**
- Every component takes typed props and has zero hidden dependencies on global state unless explicitly using a documented shared context (e.g. `AuthContext`, `ThemeContext`).
- Business logic never lives inside components — components call `services/*` functions.
- Every "service" (investments, payouts, users, documents, crypto pricing) is its own module with a clear interface, independently testable, independently mockable.
- Shared UI primitives (`/components/ui`) must have no page-specific knowledge — they're a reusable design-system layer.
- Feature flags (`/lib/config/features.ts`) should gate things like "live crypto price feed" vs "mock price feed," so features can be toggled without touching business logic.

---

## 4. UI/UX DIRECTION — "ISLAND" FLUID STYLE

Design language: **floating "island" panels** — rounded, elevated, glassy/soft-shadow cards that feel like they're floating above a soft-gradient or dark canvas background, with generous negative space and buttery micro-interactions. Reference points: Linear.app, Arc browser, Robinhood's newer dashboard, Vercel's dashboard aesthetic.

Key UI principles for the AI to implement:
- **Islands, not walls:** every content section (stat block, chart, plan card, table) is its own rounded "island" (16–24px radius), gently elevated with soft shadows, floating on a subtly-different background layer.
- **Fluid motion:** page transitions and in-view animations use spring-based easing (Framer Motion), not linear/ease-in-out. Elements should feel like they have weight and momentum — slight overshoot on hover/press, staggered fade+slide on scroll-into-view.
- **Micro-interactions everywhere:** buttons compress slightly on press, cards lift on hover, numbers count up when they load, charts draw themselves in on mount, toggle switches have satisfying slide/spring motion.
- **Sticky, minimal nav** that shrinks/blurs on scroll (frosted glass effect).
- **Dark-mode-first** with a premium palette (deep navy/charcoal base, one confident accent color — suggest a electric green or gold to nod to both "money" and "growth"; avoid generic crypto neon).
- **Typography:** one confident display font for headlines (geometric sans, e.g. a Inter/General Sans/Satoshi-style face) + a clean body font. Big, confident numerals for financial data (tabular-nums).
- **Data visualization:** portfolio growth charts, ROI projections, and property value graphs should animate smoothly (Recharts or Visx with custom easing), never appear as static jpegs.

> **Dashboard reference (Pinterest — "Fierce" fintech dashboard):** Mirror this layout structure, not its content.
> - **Left rail:** dark, semi-transparent/frosted sidebar, floating with rounded corners over a blurred background photo. Logo + name top-left, nav items with icons (Home, Cash, Budgets, Invest, Market, Help, Theme), active item highlighted with a soft light-gray pill background. User account card pinned to the bottom of the sidebar (avatar, name, account type, kebab menu).
> - **Top bar:** casual greeting ("Hi Gustavo 👋" style) + subtext on the left, a prominent pill-shaped primary action button ("Take Action") on the right with a circular accent-colored icon button next to it.
> - **Main grid is a true island layout:** every widget is its own independently-rounded, elevated card floating on the translucent dark canvas — no shared borders between widgets, clear gutters between islands.
> - **Balance island (top-left, wide):** large tabular-nums balance figure with an eye icon to toggle visibility, a green gain/percentage badge next to it, and a horizontal timeframe switcher (1D/7D/6M/YTD/1Y/All) as pill tabs.
> - **Performance chart island (below balance):** a labeled sub-value ("Investments" total) with timestamp, a smooth gradient-stroke line chart (purple → pink gradient) with a hover tooltip showing two stacked mini-cards (e.g. "Stock Rewards $911.90") anchored to the hovered point.
> - **Two side-by-side sub-islands under the chart:** matching mini cards (e.g. Checking / Crypto Lending) each with a balance, a small tag (FDIC Insured / Crypto Insured), an APY line, and a rounded pill "Deposit" button bottom-right.
> - **Right column, top island:** an alerts/referral banner card with a rounded pill CTA button ("Get Code") and a "See More Alerts" link below.
> - **Right column, rewards island:** a title with a small icon + a month dropdown filter, a large glowing circular progress/donut chart in the center (accent gradient ring) with a bold dollar figure inside, a color-coded legend list below it (Cash/Stock/Crypto/Lending Rewards each with amount), and a full-width pill CTA at the bottom ("Transfer to Earn").
> - **Bottom-left island, full width:** "Today's Market" header + "View All" link, horizontally scrollable row of ticker mini-cards (logo, ticker, company name) — arrows to scroll left/right.
> - **Bottom-right island:** "Upcoming Bills" header + "Connect More" link, small logo tiles for connected billers.
> - **Overall palette:** near-black translucent glass cards over a warm, blurred real-world background photo (creates depth/atmosphere rather than a flat dark background); accents are a purple-to-pink gradient (donut chart, line chart) plus green for positive deltas.
> - **Typography feel:** large, confident, tight-tracking numerals for money values; small uppercase-ish muted labels above/below them.
>
> **How this maps to QuidMotion's dashboard:** swap "Cash/Stock/Crypto/Lending Rewards" for something like **Real Estate Equity / Crypto Yield / Referral Rewards / Staking Rewards**; swap the ticker row for **Featured Properties / Live Deals**; swap "Upcoming Bills" for **Upcoming Payouts** or **Maturing Investments**; keep the glassy-island-over-blurred-photo look but consider a blurred skyline/property photo as the background to visually reinforce "real estate."

---

## 5. DESIGN SYSTEM (TOKENS)

Define a single source of truth in `/lib/config/tokens.ts` (or `tailwind.config.ts` theme extension):
- Color scale (background layers, island surface, borders, accent, success/warning/danger, muted text)
- Radius scale (sm/md/lg/xl/2xl — islands use lg–2xl)
- Shadow scale (subtle → elevated → floating)
- Spacing scale
- Motion tokens: durations (150ms/250ms/400ms) and spring configs (stiffness/damping presets: "snappy," "smooth," "gentle")

All components pull from these tokens — no hardcoded hex codes or magic numbers in components.

---

## 6. PAGES — DETAILED REQUIREMENTS

### 6.1 Home Page (conversion-critical)
Goal: hook visitors and move them toward "Start Investing." Structure as modular sections, each its own component:
1. **Hero island** — bold headline (e.g. "Real Estate Investing, Powered by Crypto"), animated background (subtle particle/gradient motion), primary CTA + secondary "See how it works," a live-feeling animated stat strip (e.g. total invested, avg. ROI, properties funded — pull from `services/stats.ts`, mockable).
2. **Trust bar** — logos/press mentions or credentials strip (licensing, years of experience, team size).
3. **How it works** — 3–4 step animated flow (Deposit crypto → Choose a plan → Team invests in vetted property → Earn returns), each step a scroll-triggered island.
4. **Live/simulated portfolio performance chart** — an animated growth chart to build FOMO, with a caption like "See what an early investor's portfolio looks like."
5. **Investment plans preview** — 3 plan cards (teaser of the full Plans page) with a comparison at a glance.
6. **Team credibility section** — expert bios (photos, years of experience, past deals), building authority.
7. **Testimonials / social proof carousel.**
8. **FAQ teaser** (3–4 top questions, link to full FAQ).
9. **Final conversion CTA island** — urgency-driven ("Limited allocation this quarter") + sign-up form.
10. Footer with legal links to Documents page.

Include scroll-triggered reveal animations throughout, a persistent floating CTA button that appears after scrolling past the hero, and exit-intent or time-based modal offering a guide/lead magnet (e.g. "Get the Crypto Real Estate Investment Guide") — make this modal a toggleable feature flag.

### 6.2 About Page
Company story, mission (democratizing real estate investing via crypto), team section (modular `TeamMemberCard` components), timeline of milestones, licensing/compliance statements.

### 6.3 Investment Plans Page
Modular `PlanCard` components pulling from `services/investments.ts` (plan name, min investment, projected APY range, lock-up period, risk tier, crypto assets accepted). Include a comparison table view and an interactive ROI calculator (input amount + duration → animated projected returns chart).

### 6.4 FAQ Page
Accordion-based (`FAQAccordion` component), categorized (Getting Started, Crypto & Payments, Returns & Payouts, Security, Legal), search/filter bar.

### 6.5 Login Page → Dashboard
- Login/Register with email+password (and room for wallet-connect/social login later), forgot-password flow.
- On success, routes to `/dashboard`.

**Dashboard (modular widget grid, island-style):**
- Portfolio value island (animated counter + mini sparkline)
- Active investments list (per-property or per-plan cards with status, ROI to date)
- Deposit/withdraw crypto island (with QR/wallet address flow — mockable service)
- Performance chart island (full portfolio growth over time)
- Transaction history table (filterable, paginated)
- Referral/rewards island (optional, feature-flagged)
- Notifications/alerts island
- Account settings (KYC status, security settings, linked wallets)

### 6.6 Documents Page
Modular document viewer — Terms & Conditions, Privacy Policy, Risk Disclosure, AML/KYC Policy — each stored as MDX or markdown content files (`/content/documents/*.mdx`) rendered through one shared `DocumentViewer` component, so legal team can update text without touching code. Include table of contents sidebar + last-updated timestamps.

### 6.7 Admin Page
Separate protected layout (`/app/admin`), role-gated via auth service.
- Overview dashboard (total users, total AUM, pending KYC, pending withdrawals)
- User management table (search/filter, view detail, suspend/activate)
- KYC approval queue
- Investment plan management (create/edit/archive plans)
- Transaction/payout approval workflow
- Content management for Documents/FAQ (edit MDX content via simple form)
- Audit log of admin actions

---

## 7. SECURITY & COMPLIANCE NOTES FOR THE AI

- All financial figures and crypto balances are **mock/service-abstracted** during local-first development — no real wallet integration until explicitly requested.
- Auth passwords hashed (bcrypt/argon2) even in local dev DB.
- RLS-equivalent access checks must exist in the local adapter too (i.e., don't rely on Supabase RLS alone — enforce authorization in the service layer so behavior is identical pre- and post-migration).
- Admin routes must check role server-side (middleware), not just hide UI client-side.

---

## 8. DELIVERABLE EXPECTATIONS

When building, the AI should:
1. Scaffold the folder structure above first.
2. Build the design-token/UI-primitive layer before pages.
3. Build the local DB schema + seed script before wiring up pages.
4. Build pages section-by-section as composed, independent components.
5. Note clearly, in comments or a `MIGRATION.md`, exactly what changes (only env vars + running Supabase migrations) when moving from local to Supabase/Vercel.

---

### Fill in before sending to your AI tool:
- [ ] Confirm accent color direction (green/gold, or the purple-to-pink gradient from the reference)
- [ ] Confirm font choices if you have brand preferences
- [ ] Confirm which crypto assets are supported at launch (BTC/ETH/stablecoins?)
- [ ] Confirm minimum investment amounts / plan tiers if already decided
