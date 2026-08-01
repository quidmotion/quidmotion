# QuidMotion Vercel Deployment & Runtime Diagnostics Handoff

## 📌 Overview & Current Status

- **GitHub Repository**: `https://github.com/quidmotion/quidmotion.git`
- **Vercel Live URL**: `https://quidmotion-flame.vercel.app/`
- **Vercel Build Status**: **Build succeeds cleanly** (no TypeScript or compilation errors).
- **Runtime Status (pre-fix)**: Visiting certain live URLs triggers a Vercel 500 Server-Side Exception (`Application error: a server-side exception has occurred while loading quidmotion-flame.vercel.app...`).
- **Runtime Status (post-fix)**: Root cause fixed in code (await all Postgres queries). **Redeploy required** for live site to pick up changes.

---

## 🔍 Specific Digests Reported on Live Site

1. **User Dashboard** (`/dashboard`):
   - Digest: `3793776720` (and `245407353`)
2. **Admin Users** (`/admin/users`):
   - Digest: `948888730`
3. **Admin KYC** (`/admin/kyc`):
   - Digest: `2643061870`
4. **Admin Deposits** (`/admin/deposits`):
   - Digest: `3794756983`
5. **Admin Withdrawals** (`/admin/payouts`):
   - Digest: `811967268`
6. **Admin Properties** (`/admin/properties`):
   - Digest: `3700738928`
7. **Admin Settings** (`/admin/settings`):
   - Digest: `2691262776`
8. **Admin Audit** (`/admin/audit`):
   - Digest: `3461416234`
9. **Working Tabs without Errors** (pre-fix):
   - `/admin` (Overview)
   - `/admin/plans`
   - `/admin/content` (partially — fell back to hardcoded doc titles)

---

## 🛠️ Work Completed So Far (prior agents)

1. **Database Adapter & Polyfills** (`lib/db/adapters/supabase.ts`):
   - Added `parsePgOptions()` to handle connection strings with special characters (`@`, `#`, `%`).
   - Added `patchDrizzlePostgres()` to polyfill `.get()`, `.all()`, and `.run()` methods on Drizzle PostgreSQL query builders.
2. **Dynamic Route Configuration**:
   - Set `export const dynamic = "force-dynamic";` across all 23 database-driven page routes.
3. **Database Schema Sync**:
   - Added missing `lockup_days` column to the Supabase PostgreSQL `users` table via `ALTER TABLE users ADD COLUMN IF NOT EXISTS lockup_days integer DEFAULT 90;`.
4. **Async Service Migration (partial)**:
   - Converted some core database service functions and authentication from synchronous SQLite queries to `async/await`.

---

## ✅ Root Cause Found & Fixed (this agent)

### Diagnosis

Vercel CLI logs were unavailable in this environment (CLI hang / not linked). Static analysis of working vs failing routes identified the crash pattern:

| Working routes | Why they worked |
|---|---|
| `/admin` | `getAdminOverview()` already used `await db.select()...` |
| `/admin/plans` | `listPlans()` already used proper async selects; no `loadActor` |
| `/admin/content` | `listDocuments()` used `.get()` but fell back to hardcoded titles when the Promise was not a row |

| Failing routes | Why they 500'd |
|---|---|
| `/dashboard`, `/admin/users`, `/admin/kyc`, `/admin/deposits`, `/admin/payouts`, `/admin/properties`, `/admin/settings`, `/admin/audit` | Called `loadActor()` or other helpers that used **SQLite-style `.get()` / `.all()` / `.run()` without `await`** |

On Postgres (`drizzle-orm/postgres-js`):

1. **`loadActor`** did `db.select()....get()` and treated the result as a row. With the polyfill, `.get()` returns a **Promise**. Promises are truthy, so `row.id` / `row.role` were `undefined` → `assertAdmin` / `assertSelfOrAdmin` threw → uncaught `AppError` → Next.js 500 digests.
2. **`listDefaultPortfolioRates` / `listEmailOutbox` / `listAdminWithdrawals`** used `.all()` (polyfill returned the thenable) then called `.map` / `.slice` on a non-array → `TypeError`.
3. Inserts/updates with bare `.run()` never actually waited for completion on Postgres.

The polyfill was a band-aid and **unsafe when callers do not await**. Correct fix: real `async/await` everywhere.

### Auth / middleware audit

- `middleware.ts`: edge-safe sealed JWT only — OK.
- `lib/auth/adapters/local.ts`: session resolution already uses `await db.select()...` — OK.
- Layouts call `getAuth().getSession()` correctly — OK.
- Failures were **after** auth, inside service-layer actor loads and queries.

### Schema vs Supabase

- No additional missing-column evidence beyond prior `lockup_days` fix.
- Working pages already queried the same tables (`users`, `kyc_submissions`, `payouts`, `transactions`) with proper await, so schema drift was not the primary crash.

### Connection pooling / SSL

Updated `lib/db/adapters/supabase.ts`:

- `ssl: "require"`
- `prepare: false` (required for Supabase PgBouncer / transaction pooler)
- Serverless-friendly pool: `max: 1`, `idle_timeout: 20`, `connect_timeout: 10`, `max_lifetime: 300`
- Removed the unreliable `patchDrizzlePostgres` polyfill (no longer needed)

**Recommended `DATABASE_URL` on Vercel**: Supabase **transaction pooler** (`…pooler.supabase.com:6543`) or session pooler (`:5432`) with SSL. Prefer the pooler host, not the direct DB host, for serverless.

### Code changes (this agent)

- Made `loadActor` async; all service callers `await loadActor(...)`.
- Converted remaining services off `.get()` / `.all()` / `.run()`:
  - `_authz`, `audit`, `users`, `kyc`, `payouts`, `crypto`, `email`, `growth`, `notifications`, `transactions`, `documents`, `leads`, `settings`, `properties`, `investments`, `referrals`
- Fixed pages/actions that called async helpers without `await` (admin settings/users/content, documents marketing pages, dashboard transactions, admin actions, lockup action, cron growth route).
- `npm run typecheck` passes (0 errors).

---

## 🚨 Next steps for deploy

1. **Commit & push** these changes, then redeploy on Vercel (or `npx vercel --prod` if linked).
2. Confirm Vercel env vars: `DB_PROVIDER=supabase`, `AUTH_PROVIDER=local`, `DATABASE_URL` (pooler URL + SSL), `SESSION_SECRET` / seal secret used by `lib/auth/sealed.ts`.
3. Smoke-test authenticated routes after deploy:
   - `/dashboard`
   - `/admin/users`, `/admin/kyc`, `/admin/deposits`, `/admin/payouts`, `/admin/properties`, `/admin/settings`, `/admin/audit`
4. If any digest remains, pull **Runtime Logs** in the Vercel dashboard for that deployment (CLI was unreliable here) and match the stack to the route.
