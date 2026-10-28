# M37 Production currency and billing separation

Verified Production subscription inventory (2026-10-27): one LIVE_ACTIVE PayPal monthly billing plan in USD, 999 minor units. Preserve this plan and its ID; do not create synthetic PayPal plan IDs.

## Recurring monthly PayPal subscription
Currencies: USD, EUR, GBP, SGD, AUD, CAD. USD existing live plan remains unchanged. Five additional currencies require **actual live PayPal Billing Plan IDs**, each independently verified before being made LIVE_ACTIVE. Never insert placeholder IDs as live plans. Recurring billing requires explicit reader consent and PayPal approval.

## One-time nonrenewing 30-day library pass
Currencies: USD, EUR, GBP, SGD, AUD, CAD; 999 minor units each. PayPal Orders v2 capture, not Billing Subscriptions API. The checkout may offer PayPal guest-card or eligible alternative funding to readers without a PayPal account, subject to country, merchant, funding eligibility and PayPal rules. No claim of universal worldwide payment acceptance.

## Access
Grant access only from server-verified successful payment or independently valid existing entitlement. Do not require a PayPal account for GPIR sign-in. Existing recurring subscriptions, free access and publication-specific entitlements remain intact.

## Release gate
No production checkout activation until additive Production migrations, reader resolver, webhook reconciliation, refund/reversal tests, and actual PayPal merchant configuration are verified. Keep checkout disabled. No Sandbox transactions or reader identities copied to Production.
