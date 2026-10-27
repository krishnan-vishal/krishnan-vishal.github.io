import { PAYPAL_ID, UUID, captureStatus, onetimeConfiguration, paypalAccessToken,
  paypalJson, sha256Hex, storedOrder, supabaseRpc, verifiedCapture }
  from '../_shared/gpir-onetime-sandbox.mjs';

const REQUIRED_HEADERS = ['paypal-transmission-id', 'paypal-transmission-time',
  'paypal-cert-url', 'paypal-auth-algo', 'paypal-transmission-sig'];

function response(status, body) {
  return new Response(JSON.stringify(body), { status, headers: {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff' } });
}

function webhookHeaders(request) {
  const result = Object.fromEntries(REQUIRED_HEADERS.map(name => [name,
    request.headers.get(name)?.trim()]));
  return REQUIRED_HEADERS.every(name => result[name]) ? result : null;
}

function verificationBody(headers, rawEvent, webhookId) {
  const prefix = JSON.stringify({
    transmission_id: headers['paypal-transmission-id'],
    transmission_time: headers['paypal-transmission-time'],
    cert_url: headers['paypal-cert-url'], auth_algo: headers['paypal-auth-algo'],
    transmission_sig: headers['paypal-transmission-sig'], webhook_id: webhookId
  });
  return `${prefix.slice(0, -1)},"webhook_event":${rawEvent}}`;
}

function captureIdForReversal(event) {
  const related = event?.resource?.supplementary_data?.related_ids?.capture_id;
  if (PAYPAL_ID.test(related || '')) return related;
  if (event?.event_type === 'PAYMENT.CAPTURE.REVERSED' && PAYPAL_ID.test(event?.resource?.id || ''))
    return event.resource.id;
  const up = event?.resource?.links?.find(link => link?.rel === 'up')?.href;
  const candidate = typeof up === 'string' ? up.split('/').filter(Boolean).at(-1) : null;
  return PAYPAL_ID.test(candidate || '') ? candidate : null;
}

async function finish(config, eventId, status, errorCode, fetchImpl) {
  return supabaseRpc({ config, name: 'gpir_finish_onetime_webhook_event', fetchImpl,
    body: { p_provider_event_id: eventId, p_processing_status: status,
      p_error_code: errorCode, p_environment: config.PAYMENT_ENVIRONMENT } });
}

export function createOnetimeWebhookHandler({ env, fetchImpl = fetch }) {
  return async function handle(request) {
    if (request.method !== 'POST')
      return response(405, { status: 'ERROR', code: 'METHOD_NOT_ALLOWED' });
    const config = onetimeConfiguration(env, { webhook: true });
    if (!config) return response(503, { status: 'ERROR', code: 'ONETIME_CHECKOUT_DISABLED' });
    const headers = webhookHeaders(request);
    if (!headers) return response(400, { status: 'ERROR', code: 'WEBHOOK_HEADERS_REQUIRED' });
    let rawEvent;
    try { rawEvent = await request.text(); } catch {
      return response(400, { status: 'ERROR', code: 'MALFORMED_WEBHOOK' });
    }
    if (!rawEvent || rawEvent.length > 1024 * 1024)
      return response(413, { status: 'ERROR', code: 'WEBHOOK_SIZE_INVALID' });
    let event;
    try { event = JSON.parse(rawEvent); } catch {
      return response(400, { status: 'ERROR', code: 'MALFORMED_WEBHOOK' });
    }
    if (typeof event?.id !== 'string' || !event.id ||
        typeof event?.event_type !== 'string' || !event.event_type)
      return response(400, { status: 'ERROR', code: 'WEBHOOK_IDENTITY_INVALID' });

    const accessToken = await paypalAccessToken({ config, fetchImpl });
    if (!accessToken) return response(503, { status: 'ERROR', code: 'PAYPAL_PROVIDER_UNAVAILABLE' });
    const verification = await paypalJson({ config, accessToken, fetchImpl,
      path: '/v1/notifications/verify-webhook-signature', method: 'POST',
      body: JSON.parse(verificationBody(headers, rawEvent, config.ONETIME_PAYPAL_WEBHOOK_ID)) });
    if (!verification.ok || verification.data?.verification_status !== 'SUCCESS')
      return response(401, { status: 'ERROR', code: 'WEBHOOK_SIGNATURE_INVALID' });

    const claim = await supabaseRpc({ config, name: 'gpir_claim_onetime_webhook_event', fetchImpl,
      body: { p_provider_event_id: event.id, p_event_type: event.event_type,
        p_resource_id: event.resource?.id || null, p_payload_sha256: await sha256Hex(rawEvent),
        p_provider_created_at: event.create_time || null,
        p_environment: config.PAYMENT_ENVIRONMENT } });
    if (!claim.ok) return response(503, { status: 'ERROR', code: 'WEBHOOK_RECONCILIATION_UNAVAILABLE' });
    if (claim.data === 'CONFLICT')
      return response(409, { status: 'ERROR', code: 'WEBHOOK_IDEMPOTENCY_CONFLICT' });
    if (claim.data === 'DUPLICATE') return response(200, { status: 'DUPLICATE_IGNORED' });
    if (claim.data !== 'CLAIMED')
      return response(503, { status: 'ERROR', code: 'WEBHOOK_PROCESSING_IN_PROGRESS' });

    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const paypalOrderId = event.resource?.supplementary_data?.related_ids?.order_id;
      if (!PAYPAL_ID.test(paypalOrderId || '')) {
        await finish(config, event.id, 'ERROR', 'RELATED_ORDER_MISSING', fetchImpl);
        return response(503, { status: 'ERROR', code: 'RELATED_ORDER_MISSING' });
      }
      const orderResult = await paypalJson({ config, accessToken, fetchImpl,
        path: `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}` });
      const localOrderId = orderResult.data?.purchase_units?.find(unit =>
        UUID.test(unit?.custom_id || ''))?.custom_id;
      const lookup = localOrderId ? await supabaseRpc({ config,
        name: 'gpir_get_onetime_order_for_webhook', fetchImpl,
        body: { p_paypal_order_id: paypalOrderId, p_local_order_id: localOrderId,
          p_environment: config.PAYMENT_ENVIRONMENT } }) : null;
      const local = lookup?.ok ? storedOrder(lookup.data) : null;
      const capture = local ? verifiedCapture(orderResult.data, local) : null;
      if (!capture || capture.captureId !== event.resource?.id) {
        await finish(config, event.id, 'ERROR', 'CAPTURE_VERIFICATION_FAILED', fetchImpl);
        return response(503, { status: 'ERROR', code: 'CAPTURE_VERIFICATION_FAILED' });
      }
      const finalized = await supabaseRpc({ config, name: 'gpir_finalize_onetime_capture', fetchImpl,
        body: { p_local_order_id: local.local_order_id, p_paypal_order_id: paypalOrderId,
          p_paypal_capture_id: capture.captureId, p_currency: capture.currency,
          p_captured_amount_minor: capture.amountMinor,
          p_provider_status: capture.providerStatus,
          p_provider_debug_id: orderResult.debugId,
          p_environment: config.PAYMENT_ENVIRONMENT } });
      if (!finalized.ok || !Array.isArray(finalized.data) || finalized.data[0]?.finalized !== true) {
        await finish(config, event.id, 'ERROR', 'CAPTURE_FINALIZATION_FAILED', fetchImpl);
        return response(503, { status: 'ERROR', code: 'CAPTURE_FINALIZATION_FAILED' });
      }
    } else if (['PAYMENT.CAPTURE.PENDING', 'PAYMENT.CAPTURE.DENIED',
      'CHECKOUT.ORDER.APPROVED'].includes(event.event_type)) {
      const paypalOrderId = event.resource?.supplementary_data?.related_ids?.order_id ||
        (event.event_type === 'CHECKOUT.ORDER.APPROVED' ? event.resource?.id : null);
      const status = event.event_type === 'CHECKOUT.ORDER.APPROVED' ? 'APPROVED' :
        event.event_type.endsWith('PENDING') ? 'PENDING' : 'DENIED';
      const marked = paypalOrderId && PAYPAL_ID.test(paypalOrderId) ? await supabaseRpc({ config,
        name: 'gpir_mark_onetime_order_status', fetchImpl,
        body: { p_paypal_order_id: paypalOrderId,
          p_paypal_capture_id: PAYPAL_ID.test(event.resource?.id || '') ? event.resource.id : null,
          p_provider_status: status, p_environment: config.PAYMENT_ENVIRONMENT } }) : null;
      if (!marked?.ok || marked.data !== true) {
        await finish(config, event.id, 'ERROR', 'STATUS_RECONCILIATION_FAILED', fetchImpl);
        return response(503, { status: 'ERROR', code: 'STATUS_RECONCILIATION_FAILED' });
      }
    } else if (['PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.CAPTURE.REVERSED'].includes(event.event_type)) {
      const captureId = captureIdForReversal(event);
      const reversed = captureId ? await supabaseRpc({ config,
        name: 'gpir_reverse_onetime_capture', fetchImpl,
        body: { p_paypal_capture_id: captureId,
          p_reversal_status: event.event_type.endsWith('REFUNDED') ? 'REFUNDED' : 'REVERSED',
          p_environment: config.PAYMENT_ENVIRONMENT } }) : null;
      if (!reversed?.ok || reversed.data !== true) {
        await finish(config, event.id, 'ERROR', 'REVERSAL_RECONCILIATION_FAILED', fetchImpl);
        return response(503, { status: 'ERROR', code: 'REVERSAL_RECONCILIATION_FAILED' });
      }
    } else {
      const ignored = await finish(config, event.id, 'IGNORED', null, fetchImpl);
      return ignored.ok && ignored.data === true ? response(200, { status: 'IGNORED' }) :
        response(503, { status: 'ERROR', code: 'WEBHOOK_COMPLETION_FAILED' });
    }

    const finished = await finish(config, event.id, 'PROCESSED', null, fetchImpl);
    return finished.ok && finished.data === true ? response(200, { status: 'PROCESSED' }) :
      response(503, { status: 'ERROR', code: 'WEBHOOK_COMPLETION_FAILED' });
  };
}

export { captureIdForReversal, verificationBody, webhookHeaders };
