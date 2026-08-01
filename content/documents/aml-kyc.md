# AML / KYC Policy

**Last updated:** 2026-07-28

QuidMotion maintains a Know Your Customer (KYC) and Anti-Money Laundering (AML) workflow.

## When KYC is required

- **Deposit:** allowed without KYC so users can fund accounts before verification
- **Subscribe to plans / withdraw:** require `kycStatus = approved`

## Process

1. User submits identity details and document uploads for admin review
2. Submission enters admin KYC queue as `pending`
3. Admin approves or rejects
4. User profile `kycStatus` updates accordingly

## Production

In production, document storage uses the Storage adapter (local filesystem or Supabase Storage). A third-party provider (e.g. Sumsub) may replace the manual queue later.
