# QuidMotion Vercel Deployment & Runtime Diagnostics Handoff

## 📌 Overview & Current Status

- **GitHub Repository**: `https://github.com/quidmotion/quidmotion.git`
- **Vercel Live URL**: `https://quidmotion-flame.vercel.app/`
- **Vercel Build Status**: **Build succeeds cleanly** (no TypeScript or compilation errors).
- **Runtime Status**: Visiting certain live URLs triggers a Vercel 500 Server-Side Exception (`Application error: a server-side exception has occurred while loading quidmotion-flame.vercel.app...`).

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
9. **Working Tabs without Errors**:
   - `/admin` (Overview)
   - `/admin/plans`
   - `/admin/content`

---

## 🛠️ Work Completed So Far

1. **Database Adapter & Polyfills** (`lib/db/adapters/supabase.ts`):
   - Added `parsePgOptions()` to handle connection strings with special characters (`@`, `#`, `%`).
   - Added `patchDrizzlePostgres()` to polyfill `.get()`, `.all()`, and `.run()` methods on Drizzle PostgreSQL query builders.
2. **Dynamic Route Configuration**:
   - Set `export const dynamic = "force-dynamic";` across all 23 database-driven page routes.
3. **Database Schema Sync**:
   - Added missing `lockup_days` column to the Supabase PostgreSQL `users` table via `ALTER TABLE users ADD COLUMN IF NOT EXISTS lockup_days integer DEFAULT 90;`.
4. **Async Service Migration**:
   - Converted core database service functions (`lib/services/*.ts`) and authentication (`lib/auth/adapters/local.ts`) from synchronous SQLite queries to `async/await`.
   - Updated Next.js Server Components across `app/(marketing)/*`, `app/admin/*`, and `app/dashboard/*` to `await` data queries.

---

## 🚨 Instructions for the Next Agent

1. **Inspect Vercel Server Logs Directly**:
   - Access the Vercel project logs or run `npx vercel logs` / inspect Vercel function runtime logs to get the full stack trace for Digests `3793776720`, `948888730`, `2643061870`, `3794756983`, `811967268`, `3700738928`, `2691262776`, `3461416234`.
2. **Check Auth Session Deserialization & Middleware**:
   - Audit `lib/auth/index.ts`, `middleware.ts`, and `lib/auth/adapters/local.ts` to ensure session cookies and claims deserialize properly when running under Vercel Edge/Serverless environments.
3. **Verify Drizzle Table Schemas vs. Supabase PostgreSQL Tables**:
   - Verify if any other columns or table references in `lib/db/schema/schema.sqlite.ts` mismatch the Supabase PostgreSQL table structure.
4. **Check Connection Pooling / SSL Settings**:
   - Ensure the Supabase database connection string uses transaction pooler mode (port `6543`) or session pooler mode (port `5432`) with appropriate SSL parameters for serverless Lambdas.
