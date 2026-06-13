---
name: Flutterwave + Trial System
description: How Flutterwave payments, multi-currency, first-100 trial, and card error notifications are wired together
---

## Payment Flow
- Frontend: `client/src/lib/flutterwave.ts` — SDK loader, currency map, plan definitions, price conversion
- Subscription page: `client/src/pages/SubscribePage.tsx` — fetches live exchange rates, opens Flutterwave inline modal
- Backend verify: `POST /api/payment/flutterwave/verify` — verifies tx with FLW API then calls `activateSubscriptionForUser()`
- Webhook: `POST /api/payment/flutterwave/webhook` — parses tx_ref format `TCD-{userId}-{planId}-{ts}`
- Card error report: `POST /api/payment/card-error` — receives frontend failure details, emails admin via `sendAdminNotification()`

## Exchange Rates
- Free API: `https://open.er-api.com/v6/latest/USD` (no key, 24h refresh)
- Route: `GET /api/payment/rates`
- Requires explicit `queryFn` (no global default in this codebase)

## Required Secrets (Replit panel)
- `VITE_FLUTTERWAVE_PUBLIC_KEY` — frontend inline checkout key
- `FLUTTERWAVE_SECRET_KEY` — backend verification; if absent, dev mode auto-activates (no verification)
- `FLUTTERWAVE_WEBHOOK_SECRET` — optional, validates `verif-hash` header on webhooks

## First-100 Trial
- On email and phone registration: count users after creation; if ≤ 100 → set `subscriptionTier: 'basic'`, `subscriptionExpiry: +14 days`, `trialActivated: true`, `trialExpiresAt: +14 days`
- Trial auto-activates without requiring card (card collection happens naturally at subscription time)
- Schema fields added: `trialActivated boolean`, `trialExpiresAt timestamp`, `flutterwaveCardToken text`

## Admin Gift Subscription
- `POST /api/admin/gift-subscription` (requireAdmin) — body: `{ userId, tier, days }`
- UI in AdminDashboardPage: gift form at top + "Gift" button per table row pre-fills userId

## Admin Skip Verification
- `VerificationPage.tsx` useEffect: if `user.isAdmin` → navigate('/app/')
- Admin is always auto-verified/promoted in `ensureAdminFlag()` in routes.ts

**Why:** Flutterwave is the payment processor for Africa-first multi-currency support; FLW inline JS handles card tokenization securely without us ever seeing raw card data.
