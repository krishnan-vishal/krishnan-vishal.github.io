# GPIR M37 — Owner-approved payment matrix (2026-10-27)

This is an implementation contract, not a new approval request.

| Currency | PayPal-account reader | Reader without PayPal account |
|---|---|---|
| USD | USD 9.99 monthly recurring | USD 9.99 one-time, 30-day access |
| EUR | EUR 9.99 monthly recurring | EUR 9.99 one-time, 30-day access |
| GBP | GBP 9.99 monthly recurring | GBP 9.99 one-time, 30-day access |
| SGD | SGD 9.99 monthly recurring | SGD 9.99 one-time, 30-day access |
| AUD | AUD 9.99 monthly recurring | AUD 9.99 one-time, 30-day access |
| CAD | CAD 9.99 monthly recurring | CAD 9.99 one-time, 30-day access |

- PayPal-account readers: monthly recurring subscription, renewed monthly until cancelled.
- Readers without a PayPal account: one-time payment for 30 days; **never automatically renew**.
- Both groups: bank-account/card and eligible alternative funding methods **only where supported by PayPal for the buyer, merchant, currency and country**. No universal guarantee of all APMs or card availability.
- Both groups: same GPIR Premium Library entitlement outcome after verified payment. Existing free/public access is unchanged.
- Sandbox testing marked Subscribed in the owner-provided matrix for all 12 combinations. Do not mistake this for live PayPal Billing Plan IDs or universal guest checkout eligibility.
- Existing USD live recurring PayPal plan remains untouched; the five other recurring currencies require actual live Billing Plan IDs, not fabricated IDs.
- Production activation remains disabled pending complete integration, security verification and live merchant configuration. No further pricing confirmation needed.
