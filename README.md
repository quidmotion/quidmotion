# QuidMotion

Crypto-powered real estate investment platform (local-first, live product flows).

## Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS v4
- Drizzle ORM + local SQLite (`node:sqlite`)
- scrypt auth + sealed JWT Edge middleware
- Recharts + island UI
- Live CoinGecko prices, transactional email outbox (Resend optional)

## Quick start

```bash
npm install
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Investor (KYC approved) | `investor@quidmotion.com` | `password123` |
| Admin | `admin@quidmotion.com` | `password123` |

## Live features (local DB)

- **KYC** — identity form + document uploads; admin review queue
- **Deposits** — admin-configurable wallets; user reports transfer → admin confirms credit; live BTC/ETH/USDT/USDC prices
- **Portfolio growth** — hourly default APY by invested tier; lock-up multipliers (90d 33% / 180d 66% / 365d 100%)
- **Withdrawals** — KYC required; address required; `pending approval` → `processing` → `completed`
- **Emails** — deposit, invest, withdraw request/complete (logged under `data/emails/` or Resend)
- **Admin** — deposits queue, wallets, official emails, featured properties, withdrawals, growth/price controls

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run db:seed` — reset/seed local SQLite
- `npm run typecheck` — TypeScript check

## Cron (hourly growth + prices)

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/growth
```

## Migration to Supabase

See **`MIGRATION_INSTRUCTIONS.md`** for full SQL, RLS, storage, export/import, auth, and tests.  
Short overview: `MIGRATION.md`.
