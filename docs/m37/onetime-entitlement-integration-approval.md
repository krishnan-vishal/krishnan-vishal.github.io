# M37 one-time entitlement integration — owner approval required

The isolated checkout writes publication-specific, expiring rows to
`public.gpir_onetime_entitlements`. Existing subscription access remains in
`public.gpir_user_access_profiles` and is not modified by capture, expiry,
refund, or reversal handling.

The current protected-publication endpoint calls
`public.resolve_publication_entitlement`. Completing reader access therefore
requires the following single shared change. It is intentionally **not applied**
by PR #468 until the owner approves this exact diff.

```diff
-ELSIF policy.access_class = 'ENTITLED' AND EXISTS (
+ELSIF policy.access_class = 'ENTITLED' AND (
+  EXISTS (
   SELECT 1 FROM public.gpir_user_access_profiles AS profile
    WHERE profile.user_id = caller
      AND profile.access_class = 'ENTITLED'
      AND profile.status = 'ACTIVE'
      AND profile.effective_from <= CURRENT_TIMESTAMP
      AND (profile.effective_until IS NULL OR
           profile.effective_until > CURRENT_TIMESTAMP)
-) THEN
+  ) OR EXISTS (
+    SELECT 1 FROM public.gpir_onetime_entitlements AS purchase
+     WHERE purchase.user_id = caller
+       AND purchase.supabase_record_id = policy.supabase_record_id
+       AND purchase.publication_id = policy.publication_id
+       AND purchase.status = 'ACTIVE'
+       AND purchase.effective_from <= CURRENT_TIMESTAMP
+       AND purchase.effective_until > CURRENT_TIMESTAMP
+  )
+) THEN
```

Impact: an `ENTITLED` publication remains allowed by the existing subscription
profile exactly as before, or by an independently verified, active, unexpired
one-time purchase for the same publication identity pair. A refund/reversal
revokes only its source order's one-time row. Expired or revoked rows deny.

Required owner decision: approve or reject this exact additive `OR EXISTS`
clause. No dashboard, authentication, subscription price, PayPal plan, or
subscription webhook change is included.

## Rollback

1. Set `ONETIME_CHECKOUT_ENABLED=false` in the affected environment.
2. Leave purchase, webhook, and audit rows intact.
3. Remove the one-time `OR EXISTS` clause if it was deployed; the original
   subscription profile branch remains unchanged.
4. Do not drop the additive tables while payment or audit records exist.
5. Existing recurring PayPal subscriptions continue through their current
   functions and webhook.
