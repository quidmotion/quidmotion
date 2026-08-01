# Portfolio growth — fix + data repair plan

**Status:** Implementation applied in code (asCents, ledger/growth/investments hardening, plan lockup, hourly snapshots, single accrue, donut fix, repair script). **Data repair not yet run** — deploy first, then `npm run db:repair-portfolio` (dry-run) and `--apply` against a backed-up Supabase DB.  
**Related:** Vercel/async Postgres work; growth logic in `lib/services/growth.ts`, portfolio UI in `lib/services/investments.ts` + `app/dashboard/page.tsx`.  
**Symptom example:** `investor@quidmotion.com` Total Portfolio showing ~$1.25 quadrillion and 7D change ~+1.85 trillion %.

---

## Goals

1. **Stop the bug** — money math never string-concatenates on Supabase.
2. **Repair bad data** — restore corrupted balances/snapshots to truthful values.
3. **Align growth rules** — tier APY × **plan** lock-up share; principal-only accrual; stable portfolio display.
4. **Make 7D/performance trustworthy** — snapshots reflect real value, not page-load spam or garbage.

---

## Root cause (summary)

| Issue | Effect |
|-------|--------|
| Postgres `BIGINT` money columns returned as **strings** by `postgres.js` | `"1250478" + 5000000` → `"12504785000000"` (concat), not `6250478` |
| App uses raw `+` on `availableCents`, `lockedCents`, `roiToDateCents`, yields | Corrupted balances written back to DB; snapshots store monsters |
| `getPortfolioSummary` accrues twice; snapshot on every accrual | Snapshot spam; 7D % compares sane first point to corrupted last |
| Lock-up multiplier from `users.lockupDays`, not investment plan | Wrong APY share (e.g. 100% vs 66%) — overstates yield, **not** the quadrillion bug |

Local SQLite often looks fine (real numbers). Production Supabase is where concat blows up.

---

## Will this break the application?

### Short answer

**No — if implemented in the order below, this should stabilize the app, not break it.**  
The riskiest part is **data repair** (wrong rebuild could set balances incorrectly), not the numeric coercion fix. Coercion makes production behave like local already does for normal values.

### What is low risk

| Change | Why it’s safe |
|--------|----------------|
| Coerce cents with `Number(...)` / `asCents()` before `+` | Same results for real numbers; **fixes** string inputs. No API shape change. |
| Accrue once per request instead of twice | Same business outcome within an hour (second call already credits $0); less load/spam. |
| Snapshot at most hourly (or cron-only) | Chart may have fewer points; totals unchanged. Better than 600+ dupes. |
| Sanity log/cap in dev or soft-guard in UI | Can start as log-only so nothing hard-fails in prod. |
| Unit tests for `"1250478" + 5000000 === 6250478` | No runtime product risk. |

### What needs care (medium risk)

| Change | Risk | Mitigation |
|--------|------|------------|
| Drizzle `bigint({ mode: "number" })` or driver int8 parse | Wrong mode on non-money bigints; precision myth above 2⁵³ | Apply only to money/`_cents` columns; product values ≪ safe integer |
| Lock-up from **plan** not user profile | Effective APY may **change** for users whose `users.lockupDays` ≠ plan (e.g. 365 profile + 180 plan → drop from 100% to 66% of tier) | Intentional product fix; document; optionally one-time notify; set `last_accrued_at = now()` so no huge backfill at new rate |
| Yield via `postLedgerEntry` | Double-credit if both raw balance update and ledger run | Either migrate fully to ledger **or** keep raw update until ledger path is exclusive |
| Hard sanity cap that **throws** | Could 500 dashboard if data still corrupt before repair | Deploy coerce first; cap as warn/log until repair done; or show fallback UI |

### What is higher risk (repair only)

| Change | Risk | Mitigation |
|--------|------|------------|
| Overwriting `user_balances` | Wrong available/locked → users see wrong cash, can’t withdraw/invest correctly | Backup first; dry-run script; per-email review; threshold + allowlist |
| Deleting snapshots | Chart history empty until new points | Expected; insert one clean “now” point; optional short backfill |
| Resetting `roi_to_date_cents` / `last_accrued_at` | Historical yield display resets; next hour accrues cleanly | Prefer reset clock after corruption; don’t backfill from 1970/epoch |
| Running repair **before** code fix | Page load/cron can re-corrupt immediately | **Code fix → deploy → repair → re-enable cron** |

### What we are explicitly not doing in this plan

- Changing auth, KYC, deposit confirmation, or withdraw approval flows.
- Redesigning tier APY bands (20–25 / 45–50 / 60–70) unless product asks.
- Wiping the whole database.
- Force-pushing or irreversible git operations.

### Rollback

| Layer | Rollback |
|-------|----------|
| Code | Revert PR / redeploy previous Vercel deployment. Coercion-only PR is easy to revert; app returns to “works on SQLite, dangerous on PG” — not ideal but known. |
| Data | Restore from Phase 0 backup / dump of the touched tables. **Keep backup until 7 days after repair.** |
| Feature | Disable cron + admin “Run accrual” if growth misbehaves. |

### Confidence

| Claim | Confidence |
|-------|------------|
| String-concat on BIGINT is the quadrillion cause | **High** (digit fingerprint, PG types, code paths, local vs prod) |
| Coercion fixes forward path without breaking normal users | **High** |
| Repair restores demo investor to ~tens of thousands USD | **High** if seed-like book; **medium** for real users without full ledger |
| Plan lockup change matches product spec | **High** for spec; **medium** for user surprise if profile lockup was used as source of truth in UI |

**Bottom line:** Application break risk is **low for the code fix**, **moderate for data repair if done carefully**, and **lowest when order is: backup → code fix + deploy → dry-run repair → apply repair → verify → cron on.**

---

## Phase 0 — Safety (before any writes)

| Step | Action |
|------|--------|
| 0.1 | Supabase **backup / dump** of `user_balances`, `user_investments`, `portfolio_value_snapshots`, `ledger_entries`, `default_portfolio_rates`, `platform_settings`. |
| 0.2 | **Read-only audit** (Phase 2 SQL) — list corrupted users. |
| 0.3 | Optionally pause cron `/api/cron/growth` and admin “Run accrual” until code is deployed (or deploy code first so accrual is safe). |

**Recommended order:** **code fix → deploy → data repair → re-enable cron.**

---

## Phase 1 — Code fix (prevent recurrence)

### 1.1 Numeric money helpers

Extend `lib/money.ts` (or equivalent):

- `asCents(value: unknown): number` — `Number(value)`, throw or return 0 on non-finite (pick one policy and use consistently).
- Use on **every** read of `*_cents` / bps before arithmetic.
- Never `row.availableCents + x` without coercion.

**Minimum touch points:**

| File | Harden |
|------|--------|
| `lib/services/growth.ts` | principal, roi, available + yield, snapshot total, multipliers |
| `lib/services/ledger.ts` | `getBalances`, `postLedgerEntry` |
| `lib/services/investments.ts` | portfolio total, subscribe amounts |
| payouts / crypto / admin actions | any balance math |

### 1.2 Postgres / Drizzle typing

App uses SQLite Drizzle `integer` against Postgres **BIGINT**.

Prefer:

- **A.** PG-aware defs with `bigint(..., { mode: "number" })` for money fields, **and**
- **B.** App-level `asCents` everywhere.

Defense in depth: driver/schema + coercion.

### 1.3 Accrual correctness (product rules)

| Rule | Implementation fix |
|------|-------------------|
| Tier by total invested ($500 / $2.5k / $10k) | Keep sum of active/maturing principal (`resolveDefaultApyBps`) |
| Random band, hourly refresh | Keep `refreshDefaultPortfolioRates` |
| Only invested principal earns | Keep `principal × apy × wholeHours / HOURS_PER_YEAR` (simple hourly) |
| 90d → 33%, 180d → 66%, 365d → 100% | Use **each investment’s plan `lockupDays`**, not only `users.lockupDays` |
| Settings multipliers | Values `0.33` / `0.66` / `1`; `Number` + validate `(0, 1]` |
| Yield posting | Prefer `postLedgerEntry({ type: "yield" })` **or** keep single raw update — not both |

### 1.4 Double work + snapshot spam

| Problem | Fix |
|---------|-----|
| Summary + `listUserInvestments` both accrue | Accrue **once** per request |
| Snapshot every page load | At most **once per hour per user**, or cron-only |
| 7D first/last raw snapshots | After repair, clean series; optional one point per day |

### 1.5 UI (optional same PR)

- Total = `asCents(available) + asCents(locked)` only.
- Donut: don’t add `roiToDateCents` on top of available (double-counts yield).

### 1.6 Guardrails

- Log (then later soft-cap) if cents exceed sanity (e.g. > $10M) so concat can’t silently present as success.
- Tests: string-like balance inputs arithmetic-sum correctly.
- Test: 180-day plan gets 0.66× tier APY even if `users.lockupDays === 365`.

**Phase 1 exit:** typecheck + tests green; staging total looks normal; second refresh same hour credits $0.

---

## Phase 2 — Data audit (read-only)

```sql
-- Suspicious balances (threshold $10M = 1_000_000_000 cents)
SELECT u.email, b.available_cents, b.locked_cents,
       pg_typeof(b.available_cents) AS avail_type
FROM user_balances b
JOIN users u ON u.id = b.user_id
WHERE b.available_cents > 1000000000
   OR b.locked_cents > 1000000000
   OR b.available_cents < 0
   OR b.locked_cents < 0;

-- Suspicious investments
SELECT u.email, i.id, i.principal_cents, i.roi_to_date_cents,
       i.effective_apy_bps, i.last_accrued_at
FROM user_investments i
JOIN users u ON u.id = i.user_id
WHERE i.principal_cents > 1000000000
   OR i.roi_to_date_cents > 1000000000
   OR i.roi_to_date_cents < 0;

-- Snapshot blow-ups
SELECT user_id, count(*) AS n,
       min(value_cents) AS min_v, max(value_cents) AS max_v
FROM portfolio_value_snapshots
GROUP BY user_id
HAVING max(value_cents) > 1000000000 OR count(*) > 500;

-- Investor focus
SELECT * FROM users WHERE email = 'investor@quidmotion.com';
-- then balances, investments, ledger, last snapshots for that user_id
```

Export emails from the first query = **repair set**.

---

## Phase 3 — Data repair

### 3.1 Principle

**Do not trust** current huge `available_cents` or monster snapshots.  
**Prefer:** ledger → confirmed txs → manual/demo baselines.

### 3.2 Rebuild balances (preferred)

For each corrupted user:

1. `locked_cents = SUM(principal_cents)` for `status IN ('active','maturing')` (if principals sane).
2. Replay `ledger_entries` for available per existing sign rules in `postLedgerEntry`, **or**  
3. Fallback 3.3 if yield never hit the ledger.

### 3.3 Fallback (yield only updated balances)

1. Keep sane `principal_cents` / locked.  
2. Reset absurd `roi_to_date_cents` (recompute or `0`).  
3. Set available from confirmed deposits − withdraw − principal + payouts; **demo seed baseline** if demo-only:

| Component | Seed intent |
|-----------|-------------|
| Locked | `$50,000` (`5_000_000`) if one $50k active investment |
| Available | `$12,500` (`1_250_000`) if unchanged demo cash |
| ROI | recompute or modest / zero + restart clock |

4. **`last_accrued_at = now()`** on active investments — prevents multi-day/year backfill in one request after repair.

### 3.4 Snapshots

```sql
DELETE FROM portfolio_value_snapshots WHERE user_id = $uid;
-- or DELETE where value_cents > threshold
```

Insert one clean row: `value_cents = repaired_available + repaired_locked`, `as_of = now()`.

### 3.5 Investor checklist (`investor@quidmotion.com`)

| Field | Target (unless real activity differs) |
|-------|----------------------------------------|
| `locked_cents` | `5000000` if still one $50k investment |
| `available_cents` | ledger/txs truth; else seed `1250000` |
| `principal_cents` | `5000000` |
| `roi_to_date_cents` | recomputed or `0` + `last_accrued_at = now()` |
| `effective_apy_bps` | `round(tierApy × planLockupMult)` (e.g. ~60–70% × 0.66 for 180d) |
| snapshots | purged + one clean row |

### 3.6 Execution

- Script: `scripts/repair-portfolio-balances.ts` with **dry-run** (default) and `--apply`.
- Log before/after per user; staging first if available.
- **Phase 3 exit:** audit returns zero over-threshold rows; investor Total in normal USD range; 7D not in trillions %.

---

## Phase 4 — Re-enable growth

1. Phase 1 deployed.  
2. Phase 3 applied.  
3. One manual accrual (admin or cron + secret).  
4. Confirm ~1 hour of simple interest only; one snapshot; Total moves by cents/dollars.  
5. Re-enable Vercel cron.

---

## Phase 5 — Verification matrix

| Check | Expected |
|-------|----------|
| Balances coerced before math | number |
| Unit test string inputs | arithmetic sum, not concat |
| Investor total | ~tens of thousands USD if seed-like |
| 7D % after repair | small or ~0 until real series builds |
| 90 / 180 / 365 plan | 33% / 66% / 100% of **same** tier APY |
| Tier bands | 20–25 / 45–50 / 60–70 |
| Two refreshes same hour | second credits $0 |
| No dashboard 500s | growth/summary paths succeed |

---

## Suggested PR breakdown

| PR | Scope | Break risk |
|----|--------|------------|
| **PR1 – Money safety** | `asCents`, coerce ledger/growth/investments, tests, log-only sanity | **Very low** |
| **PR2 – Growth rules** | plan lockup; single accrue; hourly snapshot; optional yield ledger | **Low–medium** (APY display/rate change) |
| **PR3 – Repair tooling** | dry-run/apply script + run with backup | **Medium** (data); low if dry-run first |
| **PR4 – UI polish** | donut double-count; empty 7D UX | **Very low** |

---

## Risk register (quick)

| Risk | Mitigation |
|------|------------|
| Repair wipes legitimate large books | High threshold + human review per email |
| Accrual backfill after repair | Always `last_accrued_at = now()` post-repair |
| `mode: "number"` above 2⁵³ | Irrelevant for normal USD cents here |
| Concurrent cron + user accrue | Whole-hour gate; optional row lock later |
| Re-corrupt after repair | Deploy coercion **before** or **with** repair |

---

## One-line summary

**Fix:** coerce all cent fields to numbers (align PG bigint handling), accrue once, snapshot rarely, lock-up from **plan**.  
**Repair:** rebuild locked from principals; rebuild available from ledger/txs (demo → seed baselines); reset ROI/accrual clock; delete bad snapshots; one clean point.  
**Safety:** code fix is low-risk and prevents breakage; repair is careful and reversible via backup; order is backup → deploy fix → dry-run → apply → verify → cron.

---

## Implementation note

**Code fix:** landed in `lib/money.ts`, `lib/services/{ledger,growth,investments,payouts,stats,referrals,crypto}.ts`, `lib/db/adapters/supabase.ts`, `app/dashboard/page.tsx`.

**Repair tooling:** `scripts/repair-portfolio-balances.ts` (dry-run default; `--apply` to write).

```bash
# After deploy + Supabase backup:
npm run db:repair-portfolio
# DB_PROVIDER=supabase DATABASE_URL=... npm run db:repair-portfolio -- --email=investor@quidmotion.com
# DB_PROVIDER=supabase DATABASE_URL=... npm run db:repair-portfolio -- --apply --email=investor@quidmotion.com
```

Do not treat production data as repaired until the repair script has been run with `--apply` against a backed-up database.
