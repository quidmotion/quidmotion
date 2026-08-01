# 📄 QuidMotion Deployment Handoff & Troubleshooting Summary

This document summarizes the current deployment status, all encountered Vercel build errors, fixes applied so far, root cause analysis, and recommended next steps for the incoming agent.

---

## 📍 1. Executive Summary & Environment

- **Framework**: Next.js 15 (App Router), TypeScript, Tailwind CSS v4, Drizzle ORM.
- **Database Provider**: Supabase PostgreSQL (Production endpoint: `aws-0-eu-west-1.pooler.supabase.com:5432`).
- **Database Migration State**: ✅ **100% Complete**. All 23 tables, RLS policies, default APY seeds, and 1,100+ data rows have been deployed and verified on Supabase PostgreSQL.
- **Environment Settings (`.env.local`)**:
  - `DB_PROVIDER=supabase`
  - `AUTH_PROVIDER=local`
  - `DATABASE_URL=postgresql://postgres.obcssaddhwwybtdwvggz:[PASS]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`

---

## 📜 2. Timeline of Vercel Errors & Fixes Applied

### ❌ Error 1: npm ERESOLVE Peer Dependency Conflict
- **Vercel Log**: `npm error ERESOLVE could not resolve ... peerOptional better-sqlite3`
- **Root Cause**: `drizzle-orm` had a peer dependency conflict with the local `better-sqlite3-stub`.
- **Fix Applied**: Added `.npmrc` with `legacy-peer-deps=true` to force `--legacy-peer-deps` on Vercel build environments. (Commit `c674bd0`)

---

### ❌ Error 2: TypeScript `TS7006` Parameter Implicitly Has 'any' Type
- **Vercel Log**: `Type error: Parameter 'plan' implicitly has an 'any' type in app/(marketing)/page.tsx`
- **Root Cause**: Unannotated callback parameters in `.map()`, `.filter()`, and `.reduce()` across Next.js pages and service files under strict `noImplicitAny`.
- **Fix Applied**:
  - Annotated `listPlans`, `listFaq`, `listAudit`, etc., with explicit return types (`InvestmentPlan[]`, `FaqEntry[]`, `AuditEvent[]`).
  - Added explicit parameter types across all 42 service and page files.
  - Verified locally with `npm run typecheck` (0 errors). (Commits `d4246fd`, `21d747c`, `8835d62`)

---

### ❌ Error 3: `URIError: URI malformed` at `decodeURIComponent`
- **Vercel Log**: `Error occurred prerendering page "/": URIError: URI malformed`
- **Root Cause**: The Supabase connection string contained unescaped special characters (`@#@101010Work%`), causing `postgres-js` URI parser to fail on `%@` during static page prerendering.
- **Fix Applied**: Implemented `parsePgOptions(url)` in `lib/db/adapters/supabase.ts` to extract host, port, user, password, and database into a structured connection object, avoiding unsafe `decodeURIComponent` calls. (Commit `1513e39`)

---

### ❌ Error 4: `TypeError: .get is not a function` / Prerender Execution Error
- **Vercel Log**: `TypeError: a.select(...).from(...).orderBy(...).get is not a function at app/(marketing)/page.js`
- **Root Cause**: SQLite Drizzle uses synchronous `.get()`, `.all()`, and `.run()`, whereas PostgreSQL Drizzle (`drizzle-orm/postgres-js`) returns Promises (`PgSelectQueryBuilderBase`).
- **Fix Applied**: Added `patchDrizzlePostgres` polyfill to `lib/db/adapters/supabase.ts` attaching `.get()` (resolves `rows[0]`), `.all()` (resolves `rows`), and `.run()` to Drizzle Postgres query builder prototypes. (Commit `35b7921`)

---

## 🔍 3. Root Cause Analysis of Remaining Build Issue

While `.get()` and `.all()` polyfills work when awaited, Next.js static site generation (prerendering at build time) attempts to render pages like `/` and `/admin` while data service functions (e.g. `listPlans()`, `listFaq()`) were originally written synchronously for SQLite:

```ts
// Original SQLite code (synchronous):
export function listPlans() {
  const db = getDb();
  return db.select().from(investmentPlans).all();
}
```

In Postgres Drizzle, `db.select().from(...)` returns a **Promise**.
When a Next.js Server Component receives a Promise instead of an array of objects during static HTML generation, serializing or mapping over the Promise throws a prerender error.

---

## 💡 4. Recommended Solutions for the Next Agent

To resolve the remaining prerender error on Vercel, the next agent should implement one (or both) of the following standard Next.js patterns:

### Option A: Mark Marketing & Admin Pages as Dynamic (Quickest Fix)
Disable static prerendering for routes that query the database by adding:
```ts
export const dynamic = "force-dynamic";
```
At the top of:
- `app/(marketing)/page.tsx`
- `app/(marketing)/plans/page.tsx`
- `app/(marketing)/faq/page.tsx`
- `app/admin/page.tsx`

This tells Next.js to render these pages at request time (SSR) rather than static build time.

---

### Option B: Async/Await Service Layer Migration (Architecturally Cleanest)
Make the database service functions `async` and `await` their queries:

```ts
// lib/services/investments.ts
export async function listPlans(activeOnly = true): Promise<InvestmentPlan[]> {
  const db = getDb();
  const rows = (await db.select().from(investmentPlans)) as InvestmentPlan[];
  return activeOnly ? rows.filter((p) => p.status === "active") : rows;
}
```

And update caller Server Components:
```ts
// app/(marketing)/page.tsx
export default async function HomePage() {
  const plans = (await listPlans()).slice(0, 3);
  ...
}
```

---

## 📌 File References for Next Agent
- Supabase Adapter: [lib/db/adapters/supabase.ts](file:///D:/QuidMotion/lib/db/adapters/supabase.ts)
- DB Layer Switcher: [lib/db/index.ts](file:///D:/QuidMotion/lib/db/index.ts)
- Environment Config: [`.env.local`](file:///D:/QuidMotion/.env.local)
- Services: `lib/services/*.ts`
- Migration Guide: [MIGRATION_INSTRUCTIONS.md](file:///D:/QuidMotion/MIGRATION_INSTRUCTIONS.md)
