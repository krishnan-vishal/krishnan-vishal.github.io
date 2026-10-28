import { PAYPAL_ID, UUID, onetimeConfiguration, paypalAccessToken, paypalJson,
  productionStoredOrder, sha256Hex, supabaseRest, supabaseRpc, verifiedCapture }
  from '../_shared/gpir-onetime-production.mjs';

const REQUIRED_HEADERS = ['paypal-transmission-id', 'paypal-transmission-time',
  'paypal-cert-url', 'paypal-auth-algo', 'paypal-transmission-sig'];
const EVENT_TABLE = 'gpir_m37_onetime_webhook_events';
const ORDER_TABLE = 'gpir_m37_onetime_orders';

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

async function claimEvent(config, event, payloadSha256, fetchImpl) {
  const inserted = await supabaseRest({ config, table: EVENT_TABLE,
    query: '?on_conflict=provider_event_id', method: 'POST', fetchImpl,
    prefer: 'resolution=ignore-duplicates,return=representation', body: {
      provider_event_id: event.id, event_type: event.event_type,
      payload_sha256: payloadSha256, status: 'RECEIVED'
    } });
  if (!inserted.ok || !Array.isArray(inserted.data)) return 'UNAVAILABLE';
  if (inserted.data.length === 1) return 'CLAIMED';
  const existing = await supabaseRest({ config, table: EVENT_TABLE, fetchImpl,
    query: `?select=event_type,payload_sha256,status&provider_event_id=eq.${encodeURIComponent(event.id)}&limit=1` });
  const row = existing.ok && Array.isArray(existing.data) && existing.data.length === 1
    ? existing.data[0] : null;
  if (!row) return 'UNAVAILABLE';
  if (row.event_type !== event.event_type || row.payload_sha256 !== payloadSha256)
    return 'CONFLICT';
  if (['PROCESSED', 'IGNORED'].includes(row.status)) return 'DUPLICATE';
  return ['RECEIVED', 'ERROR'].includes(row.status) ? 'CLAIMED' : 'UNAVAILABLE';
}

async function finish(config, eventId, status, fetchImpl, now) {
  const updated = await supabaseRest({ config, table: EVENT_TABLE, method: 'PATCH', fetchImpl,
    query: `?provider_event_id=eq.${encodeURIComponent(eventId)}`,
    prefer: 'return=representation',
    body: { status, processed_at: new Date(now()).toISOString() } });
  return updated.ok && Array.isArray(updated.data) && updated.data.length === 1;
}

async function orderForWebhook(config, localOrderId, fetchImpl) {
  const result = await supabaseRest({ config, table: ORDER_TABLE, fetchImpl,
    query: `?select=id,paypal_order_id,paypal_capture_id,currency,amount_minor,duration_days,status&id=eq.${localOrderId}&environment=eq.PRODUCTION&limit=1` });
  return result.ok && Array.isArray(result.data) && result.data.length === 1
    ? result.data[0] : null;
}

async function markOrderStatus(config, paypalOrderId, status, fetchImpl) {
  const allowed = status === 'APPROVED' ? 'CREATED' : 'CREATED,APPROVED,PENDING';
  const result = await supabaseRest({ config, table: ORDER_TABLE, method: 'PATCH', fetchImpl,
    query: `?paypal_order_id=eq.${encodeURIComponent(paypalOrderId)}&status=in.(${allowed})`,
    prefer: 'return=representation', body: { status } });
  return result.ok && Array.isArray(result.data) && result.data.length === 1;
}

function finalizedEntitlement(data) {
  const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
  return row?.finalized === true && typeof row.effective_until === 'string'
    ? row.effective_until : null;
}

export function createOnetimeWebhookHandler({ env, fetchImpl = fetch,
  now = () => Date.now() }) {
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

    const claim = await claimEvent(config, event, await sha256Hex(rawEvent), fetchImpl);
    if (claim === 'CONFLICT')
      return response(409, { status: 'ERROR', code: 'WEBHOOK_IDEMPOTENCY_CONFLICT' });
    if (claim === 'DUPLICATE') return response(200, { status: 'DUPLICATE_IGNORED' });
    if (claim !== 'CLAIMED')
      return response(503, { status: 'ERROR', code: 'WEBHOOK_RECONCILIATION_UNAVAILABLE' });

    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const paypalOrderId = event.resource?.supplementary_data?.related_ids?.order_id;
      if (!PAYPAL_ID.test(paypalOrderId || '')) {
        await finish(config, event.id, 'ERROR', fetchImpl, now);
        return response(503, { status: 'ERROR', code: 'RELATED_ORDER_MISSING' });
      }
      const orderResult = await paypalJson({ config, accessToken, fetchImpl,
        path: `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}` });
      const units = Array.isArray(orderResult.data?.purchase_units)
        ? orderResult.data.purchase_units : [];
      const localOrderId = units.length === 1 && UUID.test(units[0]?.custom_id || '')
        ? units[0].custom_id : null;
      const row = localOrderId ? await orderForWebhook(config, localOrderId, fetchImpl) : null;
      if (row && !row.paypal_order_id) {
        const attached = await supabaseRpc({ config, name: 'gpir_m37_attach_order', fetchImpl,
          body: { p_local_order_id: localOrderId, p_paypal_order_id: paypalOrderId } });
        if (attached.ok && attached.data === true) row.paypal_order_id = paypalOrderId;
      }
      const local = row ? productionStoredOrder([row]) : null;
      const capture = local ? verifiedCapture(orderResult.data, local) : null;
      if (!capture || capture.captureId !== event.resource?.id) {
        await finish(config, event.id, 'ERROR', fetchImpl, now);
        return response(503, { status: 'ERROR', code: 'CAPTURE_VERIFICATION_FAILED' });
      }
      const finalized = await supabaseRpc({ config,
        name: 'gpir_m37_finalize_verified_capture', fetchImpl,
        body: { p_order_id: local.local_order_id, p_paypal_order_id: paypalOrderId,
          p_paypal_capture_id: capture.captureId, p_currency: capture.currency,
          p_amount_minor: capture.amountMinor } });
      if (!finalized.ok || !finalizedEntitlement(finalized.data)) {
        await finish(config, event.id, 'ERROR', fetchImpl, now);
        return response(503, { status: 'ERROR', code: 'CAPTURE_FINALIZATION_FAILED' });
      }
    } else if (['PAYMENT.CAPTURE.PENDING', 'PAYMENT.CAPTURE.DENIED',
      'CHECKOUT.ORDER.APPROVED'].includes(event.event_type)) {
      const paypalOrderId = event.resource?.supplementary_data?.related_ids?.order_id ||
        (event.event_type === 'CHECKOUT.ORDER.APPROVED' ? event.resource?.id : null);
      const status = event.event_type === 'CHECKOUT.ORDER.APPROVED' ? 'APPROVED' :
        event.event_type.endsWith('PENDING') ? 'PENDING' : 'DENIED';
      if (!PAYPAL_ID.test(paypalOrderId || '') ||
          !await markOrderStatus(config, paypalOrderId, status, fetchImpl)) {
        const ignored = await finish(config, event.id, 'IGNORED', fetchImpl, now);
        return ignored ? response(200, { status: 'IGNORED' }) :
          response(503, { status: 'ERROR', code: 'WEBHOOK_COMPLETION_FAILED' });
      }
    } else if (['PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.CAPTURE.REVERSED'].includes(event.event_type)) {
      const captureId = captureIdForReversal(event);
      const reversed = captureId ? await supabaseRpc({ config,
        name: 'gpir_m37_revoke_verified_capture', fetchImpl,
        body: { p_paypal_capture_id: captureId,
          p_status: event.event_type.endsWith('REFUNDED') ? 'REFUNDED' : 'REVERSED' } }) : null;
      if (!reversed?.ok || reversed.data !== true) {
        const ignored = await finish(config, event.id, 'IGNORED', fetchImpl, now);
        return ignored ? response(200, { status: 'IGNORED' }) :
          response(503, { status: 'ERROR', code: 'WEBHOOK_COMPLETION_FAILED' });
      }
    } else {
      const ignored = await finish(config, event.id, 'IGNORED', fetchImpl, now);
      return ignored ? response(200, { status: 'IGNORED' }) :
        response(503, { status: 'ERROR', code: 'WEBHOOK_COMPLETION_FAILED' });
    }

    const finished = await finish(config, event.id, 'PROCESSED', fetchImpl, now);
    return finished ? response(200, { status: 'PROCESSED' }) :
      response(503, { status: 'ERROR', code: 'WEBHOOK_COMPLETION_FAILED' });
  };
}

export { captureIdForReversal, claimEvent, finalizedEntitlement, verificationBody,
  webhookHeaders };
