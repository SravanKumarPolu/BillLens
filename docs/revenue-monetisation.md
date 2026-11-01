# Revenue and Monetisation

Phase 10 Prompt 98 — Sustainable monetisation for BillLens.

> **CRITICAL:** BillLens's financial core is NEVER gated.
> Balance calculation, all 5 split methods, settlement, offline sync,
> backup/restore, expense creation, group management, and member
> management are always available on every plan — including free.
> See `src/domain/monetisation/feature-gate.ts` and the test
> `feature-gate.test.ts > "financial core features are NEVER gated"`.

## 1. Why this document exists

BillLens is a free app for personal use. To sustain development we
offer paid plans that add convenience (more OCR scans, advanced
reporting), team features (shared library, API access), and
enterprise features (SSO, custom branding, audit log retention).

We deliberately do NOT put the financial core behind a paywall. A
user must always be able to:

- Calculate balances accurately.
- Use all 5 split methods (equal, exact, percentage, share, itemised).
- Settle debts and record payments.
- Use the app offline and sync when back online.
- Back up and restore their data locally.
- Create expenses (subject to a generous free-tier monthly cap on
  COUNT, but never blocked from creating any expense at all).

This is enforced in code via `NEVER_GATED_FEATURES` and tested in
`feature-gate.test.ts`.

## 2. Plan tiers

| Tier | Monthly | Yearly | Target user |
| --- | --- | --- | --- |
| Free | $0 | $0 | Individuals tracking expenses with friends |
| Premium | $4.99 | $49.99 | Power users with multiple groups |
| Team | $14.99 | $149.99 | Small teams and families (5 seats included) |
| Enterprise | $49.99 | $499.99 | Organisations with compliance + SSO needs |

Pricing is in USD globally. Local-currency pricing is computed at
checkout using the current FX rate (Razorpay for India, Stripe for
everywhere else, Apple IAP / Google Play for mobile subscriptions).

## 3. Plan limits

| Limit | Free | Premium | Team | Enterprise |
| --- | --- | --- | --- | --- |
| Max groups | 1 | ∞ | ∞ | ∞ |
| Max expenses/month | 25 | ∞ | ∞ | ∞ |
| Max receipt scans/month | 10 | 100 | 500 | ∞ |
| Max storage | 50 MB | 5 GB | 50 GB | ∞ |
| API access | ❌ | ❌ | ✅ | ✅ |
| Advanced reporting | ❌ | ✅ | ✅ | ✅ |
| Custom branding | ❌ | ❌ | ❌ | ✅ |
| SSO (SAML / OIDC) | ❌ | ❌ | ❌ | ✅ |
| Audit log retention | 30 days | 90 days | 1 year | 7 years |

## 4. Feature gate matrix

| Feature | Free | Premium | Team | Enterprise |
| --- | --- | --- | --- | --- |
| `cloud_ocr` | ✅ (10/mo) | ✅ (100/mo) | ✅ (500/mo) | ✅ (∞) |
| `unlimited_groups` | ❌ | ✅ | ✅ | ✅ |
| `unlimited_expenses` | ❌ | ✅ | ✅ | ✅ |
| `unlimited_receipt_scans` | ❌ | ❌ | ❌ | ✅ |
| `advanced_reporting` | ❌ | ✅ | ✅ | ✅ |
| `api_access` | ❌ | ❌ | ✅ | ✅ |
| `audit_export` | ❌ | ❌ | ✅ | ✅ |
| `custom_branding` | ❌ | ❌ | ❌ | ✅ |
| `sso` | ❌ | ❌ | ❌ | ✅ |
| `white_label` | ❌ | ❌ | ❌ | ✅ |

The application layer checks feature availability via:

```ts
if (isFinancialCoreFeature(feature)) {
  // Always allow
} else if (isFeatureAvailable(feature, userPlanTier)) {
  // Allow
} else {
  // Block + show upsell
}
```

## 5. Subscription lifecycle

A subscription has one of six statuses:

| Status | Description |
| --- | --- |
| `trialing` | Free trial in progress (typically 14 days) |
| `active` | Paid and current |
| `past_due` | Payment failed but grace period (7 days) not expired |
| `canceled` | User canceled; access ends at period end |
| `expired` | Canceled + period ended, or trial ended without conversion |
| `paused` | Subscription paused (only available for yearly plans) |

### 5.1 Trial flow

1. User starts a 14-day trial of Premium/Team.
2. They enter payment info upfront (Stripe/Razorpay) but are not charged.
3. `isInTrial()` returns true until `trialEnd`.
4. At `trialEnd`:
   - If payment method is valid → charge + status='active'.
   - If payment method is invalid → status='expired', downgrade to free.

### 5.2 Cancellation flow

1. User clicks "Cancel subscription".
2. We set `cancelAtPeriodEnd=true` but keep status='active'.
3. The user retains access until `currentPeriodEnd`.
4. At `currentPeriodEnd`:
   - status='canceled'.
   - User is downgraded to free tier.
   - Their groups beyond the first are made read-only (not deleted —
     they can re-subscribe to access them again).

### 5.3 Past due handling

1. Renewal charge fails (expired card, insufficient funds).
2. Status → `past_due`. User retains access for 7 days.
3. We send dunning emails on days 1, 3, 5, 7.
4. If payment succeeds during grace → status='active'.
5. If not → status='expired', downgrade to free.

## 6. Usage tracking

Each user has a monthly `UsageRecord`:

```ts
{
  userId: 'user-1',
  period: '2026-07',
  groupsCreated: 1,
  expensesCreated: 23,
  receiptScansUsed: 8,
  storageUsedMb: 12.5,
  apiCallsMade: 0,
}
```

`checkUsageLimit()` compares the record against the plan's limits and
returns which limits are exceeded. The application layer calls this
BEFORE allowing new resource creation:

```ts
const result = checkUsageLimit(usage, plan);
if (result.limits.receiptScans.exceeded) {
  return { error: 'monthly_ocr_limit_reached', upgradeUrl: '/upgrade' };
}
```

### 6.1 Warning threshold

`shouldWarnUser()` returns true when any limit reaches 80%. The UI
shows a non-blocking banner: "You've used 8 of 10 OCR scans this
month — upgrade to Premium for 100 scans/month."

### 6.2 Hard limits vs soft warnings

- **Hard limit (blocks action)**: `groupsCreated`, `receiptScansUsed`,
  `storageUsedMb`.
- **Soft warning (no block, but UI nudges)**: `expensesCreated` (we
  never block expense creation — see "NEVER GATED" rule above — but
  we do show the warning at 80%).
- **Not tracked here**: `apiCallsMade` — handled by the rate limiter
  (`src/domain/scalability/rate-limiter.ts`) which is more granular
  (per-second, per-minute, per-day).

## 7. Proration

When a user upgrades or downgrades mid-cycle, we prorate the
difference:

```
credit = currentPlan.monthlyPrice * (daysRemaining / daysInPeriod)
charge = newPlan.monthlyPrice * (daysRemaining / daysInPeriod)
```

- **Upgrade**: `charge > credit`. User pays the difference immediately.
- **Downgrade**: `credit > charge`. The difference is applied as
  account credit toward the next invoice. We do NOT issue cash
  refunds for unused time.

`computeProration()` returns both `credit` and `charge`.
`getUpgradeNetCharge()` returns the amount to charge (0 if net
negative). `getDowngradeCredit()` returns the credit granted (0 if
net positive).

### 7.1 Example

User on Premium ($4.99/month) upgrades to Team ($14.99/month) on day
15 of a 30-day billing cycle.

```
credit = 4.99 * (15/30) = 2.50  (rounded)
charge = 14.99 * (15/30) = 7.50  (rounded)
net charge = 7.50 - 2.50 = 5.00
```

The user is charged $5.00 immediately. The next renewal (in 15 days)
charges the full $14.99.

## 8. Invoices

Every charge generates an `Invoice` with:

- `subscriptionId`, `amount`, `currency`, `periodStart`, `periodEnd`.
- `status`: draft → open → paid (or void / uncollectible).
- `provider`: stripe / razorpay / apple_iap / google_play.
- `providerInvoiceId`: for reconciliation with the provider's record.

Invoices are stored indefinitely (they're legal documents — required
for tax audits in most jurisdictions for 7 years).

`isInvoicePaid()` and `isInvoiceOverdue()` are pure helpers for
dashboard rendering.

## 9. Payment providers

| Provider | Region | Use case |
| --- | --- | --- |
| Stripe | Global (excl. India) | Web subscriptions (Premium/Team/Enterprise) |
| Razorpay | India | India web subscriptions (UPI, RuPay, net banking) |
| Apple IAP | iOS | iOS app subscriptions (Apple takes 30%, we eat the loss on Y1) |
| Google Play | Android | Android app subscriptions (15-30% fee) |

We do NOT store cardholder data — all providers use hosted payment
pages or tokenised checkout. See `PCI_DSS = not_applicable` in the
compliance framework.

## 10. Seat management (Team / Enterprise)

Team plan includes 5 seats. Additional seats are $3/seat/month.
Enterprise plan includes 25 seats; additional seats are $2/seat/month.

`getSeatUtilization(sub, seatsUsed)` returns the utilization ratio
(0..1). The UI shows an upgrade prompt when utilization ≥ 80%.

When a seat is removed (e.g. team member leaves), the seat becomes
available for reassignment. We do NOT refund the prorated seat cost —
the seat is available until the next renewal.

## 11. Free tier sustainability

The free tier is generous by design:

- 1 group (most users only need 1)
- 25 expenses/month (covers a typical month of personal spending)
- 10 OCR scans/month (lets users try the OCR feature)
- 50 MB storage (about 5,000 receipt photos at 10 KB each)

We can sustain this because:

1. The free tier does NOT include cloud OCR cost beyond 10 scans
   (we pay ~$0.001 per Google Vision API call; 10 scans = $0.01/user/month).
2. The free tier does NOT include API access (no rate-limiter cost).
3. The free tier does NOT include advanced reporting (no compute
   cost for aggregations).
4. Storage cost is ~$0.023/GB/month on S3; 50 MB = $0.001/user/month.

Blended free-tier cost: ~$0.02/user/month. With a 5% conversion to
Premium ($4.99), each paying user covers 250 free users. This is
sustainable.

## 12. Refund policy

- **Trial**: no refund needed (no charge made).
- **Monthly**: refunds available within 7 days of charge, no questions
  asked. After 7 days, no refund (the user has used the service for
  the period).
- **Yearly**: prorated refund available within 30 days of charge.
  After 30 days, no refund.

Refunds are issued via the original payment method. Stripe and
Razorpay both support this natively; Apple IAP and Google Play
require the user to request the refund from Apple/Google directly
(we cannot issue refunds through their systems).

## 13. Tax compliance

- **US**: sales tax is calculated by Stripe Tax at checkout based on
  the customer's billing ZIP code.
- **EU/UK**: VAT is charged at the customer's country rate (Stripe
  Tax handles this). B2B customers with a valid VAT ID are exempt
  (reverse charge).
- **India**: 18% GST is charged on all India-issued invoices.
  Razorpay handles GST calculation.
- **Australia**: 10% GST charged to AU customers.
- **Other**: we follow Stripe Tax's recommendations.

## 14. Dunning and churn prevention

- Day 0 (renewal fails): email "Your payment failed — please update
  your card."
- Day 1: same email, plus in-app banner.
- Day 3: same email + banner + offer 50% off next month if they
  update now.
- Day 5: final warning email.
- Day 7: subscription expires, user downgraded to free.

We do NOT use aggressive dunning (no daily emails, no phone calls).
Dunning is a brand-trust decision — we'd rather lose a subscriber
than damage the brand.

## 15. References

- `src/domain/monetisation/plan-model.ts` — plan registry + limits.
- `src/domain/monetisation/subscription-model.ts` — lifecycle helpers.
- `src/domain/monetisation/usage-tracking.ts` — limit checks + warnings.
- `src/domain/monetisation/feature-gate.ts` — gate matrix + NEVER_GATED list.
- `src/domain/monetisation/billing-model.ts` — invoices + proration.
- `src/domain/api-platform/` — API platform (team+ feature).
- `src/domain/enterprise/` — enterprise features (SSO, audit reports).
- `src/domain/scalability/rate-limiter.ts` — API call rate limiting.
- `docs/enterprise-features.md` — enterprise feature documentation.
- `docs/api-developer-platform.md` — API platform documentation.
