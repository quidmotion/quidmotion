# Migrating QuidMotion: Local SQLite → Supabase

> **Full playbook:** see [`MIGRATION_INSTRUCTIONS.md`](./MIGRATION_INSTRUCTIONS.md) for complete SQL, RLS, storage, export/import, auth, cron, and verification tests.

## What stays the same

- Application code under `lib/services/*`, pages, and Server Actions (after async adaptation)
- Auth interface (`getAuth()`), DAL interface (`getDb()`)
- Integer cents + ledger model

## What changes

1. **Environment only (app runtime)**
   ```env
   DB_PROVIDER=supabase
   AUTH_PROVIDER=supabase
   DATABASE_URL=postgresql://...
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   SESSION_SECRET=... # still used if hybrid seal retained
   RESEND_API_KEY=... # optional transactional email
   CRON_SECRET=...    # protect /api/cron/growth
   ```

2. **Schema modules** — implement `lib/db/schema/schema.pg.ts` mirroring SQLite tables; point `schema/index.ts` export at PG when `DB_PROVIDER=supabase`.

3. **Adapters** — complete `lib/db/adapters/supabase.ts` and `lib/auth/adapters/supabase.ts` (currently stubs).

4. **RLS** — apply policies from `MIGRATION_INSTRUCTIONS.md`. Service-layer authz remains mandatory.

5. **Data** — export SQLite → CSV/JSON and import into Postgres, or re-seed staging.

6. **Identity** — `users.id` must equal Supabase `auth.users.id`; set `password_hash` null in prod.

7. **Async services** — Postgres driver is async; local SQLite path is sync. Plan a services async pass before production cutover.

## Local-first checklist before migrate

- [ ] `npm run db:seed` works offline
- [ ] Demo login: `investor@quidmotion.com` / `password123`
- [ ] Admin login: `admin@quidmotion.com` / `password123`
- [ ] Live KYC submit → admin approve
- [ ] Deposit (wallet addresses from admin settings) → subscribe → withdraw with address
- [ ] Withdrawal statuses: pending approval → processing → completed
- [ ] Live prices `/api/prices` and growth cron `/api/cron/growth`
- [ ] Admin can edit wallets, emails, and featured properties
