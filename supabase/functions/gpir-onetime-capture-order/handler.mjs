import { PAYPAL_ID, authenticateSupabaseUser, captureStatus, jsonResponse,
  onetimeConfiguration, paypalAccessToken, paypalJson, safeError, storedOrder,
  supabaseRpc, validateBrowserRequest, verifiedCapture }
  from '../_shared/gpir-onetime-production.mjs';

function validInput(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    PAYPAL_ID.test(value.orderId || '');
}

function finalizedEntitlement(data) {
  const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
  if (!row || row.finalized !== true || typeof row.effective_until !== 'string') return null;
  return row.effective_until;
}

export function createOnetimeCaptureOrderHandler({ env, fetchImpl = fetch }) {
  return async function handle(request) {
    const boundary = validateBrowserRequest(request, env, ['POST']);
    if (boundary.error) return boundary.error;
    const { origin } = boundary;
    const config = onetimeConfiguration(env);
    if (!config) return safeError(503, 'ONETIME_CHECKOUT_DISABLED', origin, env);
    let input;
    try { input = await request.json(); } catch {
      return safeError(400, 'MALFORMED_REQUEST', origin, env);
    }
    if (!validInput(input)) return safeError(400, 'INVALID_CAPTURE_REQUEST', origin, env);
    const user = await authenticateSupabaseUser({ request, config, fetchImpl });
    if (!user) return safeError(401, 'SESSION_REQUIRED', origin, env);
    const lookup = await supabaseRpc({ config, name: 'gpir_m37_get_reader_order', fetchImpl,
      body: { p_user_id: user.id, p_paypal_order_id: input.orderId } });
    const local = lookup.ok ? storedOrder(lookup.data) : null;
    if (!local) return safeError(404, 'PAYMENT_ORDER_NOT_FOUND', origin, env);
    if (local.order_status === 'CAPTURED' && PAYPAL_ID.test(local.paypal_capture_id || ''))
      return jsonResponse(200, { status: 'CAPTURED', environment: 'live',
        orderId: local.paypal_order_id, entitlement: 'SERVER_VERIFIED',
        effectiveUntil: local.effective_until || null }, origin, env);

    const accessToken = await paypalAccessToken({ config, fetchImpl });
    if (!accessToken) return safeError(503, 'PAYPAL_PROVIDER_UNAVAILABLE', origin, env);
    let provider = await paypalJson({ config, accessToken, fetchImpl,
      path: `/v2/checkout/orders/${encodeURIComponent(local.paypal_order_id)}/capture`,
      method: 'POST', requestId: `capture-${local.local_order_id}`, body: {} });
    if (!provider.ok && provider.status === 422) {
      const reconciled = await paypalJson({ config, accessToken, fetchImpl,
        path: `/v2/checkout/orders/${encodeURIComponent(local.paypal_order_id)}` });
      if (reconciled.ok) provider = reconciled;
    }
    if (!provider.ok) return safeError(provider.status === 422 ? 409 : 502,
      'PAYPAL_CAPTURE_FAILED', origin, env);
    const capture = verifiedCapture(provider.data, local);
    if (!capture) {
      const status = captureStatus(provider.data);
      if (['PENDING', 'APPROVED'].includes(status)) {
        // Pending or denied provider status never grants an entitlement.
        return jsonResponse(202, { status: 'PENDING', environment: 'live',
          orderId: local.paypal_order_id }, origin, env);
      }
      if (['DENIED', 'DECLINED', 'VOIDED', 'CANCELLED'].includes(status)) {
        // Pending or denied provider status never grants an entitlement.
        return safeError(409, 'PAYPAL_PAYMENT_NOT_COMPLETED', origin, env);
      }
      return safeError(409, 'CAPTURE_NOT_COMPLETED_OR_MISMATCHED', origin, env);
    }
    const finalized = await supabaseRpc({ config, name: 'gpir_m37_finalize_verified_capture', fetchImpl,
      body: { p_order_id: local.local_order_id,
        p_paypal_order_id: local.paypal_order_id,
        p_paypal_capture_id: capture.captureId, p_currency: capture.currency,
        p_amount_minor: capture.amountMinor } });
    const effectiveUntil = finalized.ok ? finalizedEntitlement(finalized.data) : null;
    if (!effectiveUntil)
      return safeError(503, 'PAYMENT_RECONCILIATION_PENDING', origin, env);
    return jsonResponse(200, { status: 'CAPTURED', environment: 'live',
      orderId: local.paypal_order_id, entitlement: 'SERVER_VERIFIED', effectiveUntil }, origin, env);
  };
}

export { finalizedEntitlement, validInput };
