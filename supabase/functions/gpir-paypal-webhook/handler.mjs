import { reconcileSubscriptionSale } from './recurring-sale.mjs';
import { PAYPAL_BILLING_ID, PAYPAL_ID, UUID, paymentConfiguration, paypalAccessToken, paypalJson,
  sha256Hex, storedOrder, storedSubscription, supabaseRpc, verifiedCapture }
  from '../_shared/gpir-paypal.mjs';

const REQUIRED_HEADERS = ['paypal-transmission-id', 'paypal-transmission-time',
  'paypal-cert-url', 'paypal-auth-algo', 'paypal-transmission-sig'];

function response(status, body) {
  return new Response(JSON.stringify(body), { status, headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
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
    cert_url: headers['paypal-cert-url'],
    auth_algo: headers['paypal-auth-algo'],
    transmission_sig: headers['paypal-transmission-sig'],
    webhook_id: webhookId
  });
  return `${prefix.slice(0, -1)},"webhook_event":${rawEvent}}`;
}

function captureIdForReversal(event) {
  const related = event?.resource?.supplementary_data?.related_ids?.capture_id;
  if (PAYPAL_ID.test(related || '')) return related;
  if (event?.event_type === 'PAYMENT.CAPTURE.REVERSED' &&
      PAYPAL_ID.test(event?.resource?.id || '')) return event.resource.id;
  const up = event?.resource?.links?.find(link => link?.rel === 'up')?.href;
  const candidate = typeof up === 'string' ? up.split('/').filter(Boolean).at(-1) : null;
  return PAYPAL_ID.test(candidate || '') ? candidate : null;
}

async function finish(config, eventId, status, errorCode, fetchImpl) {
  return supabaseRpc({ config, name: 'gpir_finish_paypal_webhook_event_v2', fetchImpl,
    body: { p_provider_event_id: eventId, p_processing_status: status,
      p_error_code: errorCode, p_environment: config.PAYMENT_ENVIRONMENT } });
}

export function createPayPalWebhookHandler({ env, fetchImpl = fetch }) {
  return async function handle(request) {
    if (request.method !== 'POST') return response(405, { status: 'ERROR', code: 'METHOD_NOT_ALLOWED' });
    const config = paymentConfiguration(env, { webhook: true });
    if (!config) return response(503, { status: 'ERROR', code: 'PAYMENT_CONFIGURATION_REQUIRED' });
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
      body: verificationBody(headers, rawEvent, config.PAYPAL_WEBHOOK_ID) });
    if (!verification.ok || verification.data?.verification_status !== 'SUCCESS')
      return response(401, { status: 'ERROR', code: 'WEBHOOK_SIGNATURE_INVALID' });

    const payloadHash = await sha256Hex(rawEvent);
    const claim = await supabaseRpc({ config, name: 'gpir_claim_paypal_webhook_event_v2', fetchImpl,
      body: { p_provider_event_id: event.id, p_event_type: event.event_type,
        p_resource_id: event.resource?.id || null, p_payload_sha256: payloadHash,
        p_provider_created_at: event.create_time || null,
        p_environment: config.PAYMENT_ENVIRONMENT } });
    if (!claim.ok) return response(503, { status: 'ERROR', code: 'WEBHOOK_RECONCILIATION_UNAVAILABLE' });
    if (claim.data === 'CONFLICT')
      return response(409, { status: 'ERROR', code: 'WEBHOOK_IDEMPOTENCY_CONFLICT' });
    if (claim.data === 'IN_PROGRESS')
      return response(503, { status: 'ERROR', code: 'WEBHOOK_PROCESSING_IN_PROGRESS' });
    if (claim.data === 'DUPLICATE') return response(200, { status: 'DUPLICATE_IGNORED' });
    if (claim.data !== 'CLAIMED')
      return response(503, { status: 'ERROR', code: 'WEBHOOK_RECONCILIATION_UNAVAILABLE' });

    if (event.event_type === 'PAYMENT.SALE.COMPLETED' &&
        event.resource?.billing_agreement_id) {
      const renewal = await reconcileSubscriptionSale({
        event, config, accessToken, fetchImpl
      });
      if (!renewal.ok) {
        await finish(config, event.id, 'ERROR', renewal.code, fetchImpl);
        return response(503, { status: 'ERROR', code: renewal.code });
      }
      const finished = await finish(config, event.id, 'PROCESSED', null, fetchImpl);
      if (!finished.ok || finished.data !== true)
        return response(503, { status: 'ERROR', code: 'WEBHOOK_COMPLETION_FAILED' });
      return response(200, { status: renewal.status });
    }

    if (event.event_type.startsWith('BILLING.SUBSCRIPTION.')) {
      const subscriptionId = event.resource?.billing_agreement_id || event.resource?.id;
      if (!PAYPAL_BILLING_ID.test(subscriptionId || '')) {
        await finish(config, event.id, 'ERROR', 'SUBSCRIPTION_ID_MISSING', fetchImpl);
        return response(503, { status: 'ERROR', code: 'SUBSCRIPTION_ID_MISSING' });
      }
      const provider = await paypalJson({ config, accessToken, fetchImpl,
        path: `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}` });
      const localSubscriptionId = provider.data?.custom_id;
      if (!provider.ok || !UUID.test(localSubscriptionId || '') ||
          provider.data?.id !== subscriptionId) {
        await finish(config, event.id, 'ERROR', 'SUBSCRIPTION_VERIFICATION_FAILED', fetchImpl);
        return response(503, { status: 'ERROR', code: 'SUBSCRIPTION_VERIFICATION_FAILED' });
      }
      const lookup = await supabaseRpc({ config,
        name: 'gpir_get_paypal_subscription_for_webhook_v2', fetchImpl,
        body: { p_local_subscription_id: localSubscriptionId,
          p_paypal_subscription_id: subscriptionId,
          p_environment: config.PAYMENT_ENVIRONMENT } });
      const local = lookup.ok ? storedSubscription(lookup.data) : null;
      if (!local || local.paypal_plan_id !== provider.data?.plan_id) {
        await finish(config, event.id, 'ERROR', 'SUBSCRIPTION_RECONCILIATION_FAILED', fetchImpl);
        return response(503, { status: 'ERROR', code: 'SUBSCRIPTION_RECONCILIATION_FAILED' });
      }
      const eventStatus = event.event_type.split('.').at(-1);
      const status = eventStatus === 'ACTIVATED' && provider.data?.status === 'ACTIVE' ? 'ACTIVE' :
        eventStatus === 'SUSPENDED' ? 'SUSPENDED' :
        eventStatus === 'CANCELLED' ? 'CANCELLED' :
        eventStatus === 'EXPIRED' ? 'EXPIRED' :
        event.event_type === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED' ? 'PAYMENT_FAILED' : null;
      if (!status) {
        await finish(config, event.id, 'IGNORED', null, fetchImpl);
        return response(200, { status: 'IGNORED' });
      }
      const finalized = await supabaseRpc({ config,
        name: 'gpir_finalize_paypal_subscription_v2', fetchImpl,
        body: { p_local_subscription_id: localSubscriptionId,
          p_paypal_subscription_id: subscriptionId, p_status: status,
          p_effective_from: provider.data?.start_time || null,
          p_effective_until: provider.data?.billing_info?.next_billing_time || null,
          p_environment: config.PAYMENT_ENVIRONMENT } });
      if (!finalized.ok || finalized.data !== true) {
        await finish(config, event.id, 'ERROR', 'SUBSCRIPTION_FINALIZATION_FAILED', fetchImpl);
        return response(503, { status: 'ERROR', code: 'SUBSCRIPTION_FINALIZATION_FAILED' });
      }
      const finished = await finish(config, event.id, 'PROCESSED', null, fetchImpl);
      if (!finished.ok || finished.data !== true)
        return response(503, { status: 'ERROR', code: 'WEBHOOK_COMPLETION_FAILED' });
      return response(200, { status: 'PROCESSED' });
    }

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
      if (!orderResult.ok || !localOrderId) {
        await finish(config, event.id, 'ERROR', 'ORDER_VERIFICATION_FAILED', fetchImpl);
        return response(503, { status: 'ERROR', code: 'ORDER_VERIFICATION_FAILED' });
      }
      const lookup = await supabaseRpc({ config,
        name: 'gpir_get_paypal_order_for_webhook_v2', fetchImpl,
        body: { p_paypal_order_id: paypalOrderId, p_local_order_id: localOrderId,
          p_environment: config.PAYMENT_ENVIRONMENT } });
      const lookupRows = Array.isArray(lookup.data) ? lookup.data : [];
      const local = lookup.ok ? storedOrder(lookupRows.map(row => ({ ...row,
        paypal_order_id: row.paypal_order_id || paypalOrderId }))) : null;
      const capture = local ? verifiedCapture(orderResult.data, {
        ...local, paypal_order_id: paypalOrderId }) : null;
      if (!capture || capture.captureId !== event.resource?.id) {
        await finish(config, event.id, 'ERROR', 'CAPTURE_VERIFICATION_FAILED', fetchImpl);
        return response(503, { status: 'ERROR', code: 'CAPTURE_VERIFICATION_FAILED' });
      }
      const finalized = await supabaseRpc({ config, name: 'gpir_finalize_paypal_capture_v2', fetchImpl,
        body: { p_local_order_id: local.local_order_id, p_paypal_order_id: paypalOrderId,
          p_paypal_capture_id: capture.captureId, p_currency: capture.currency,
          p_captured_amount_minor: capture.amountMinor,
          p_provider_status: capture.providerStatus,
          p_provider_debug_id: orderResult.debugId,
          p_environment: config.PAYMENT_ENVIRONMENT } });
      if (!finalized.ok || finalized.data !== true) {
        await finish(config, event.id, 'ERROR', 'CAPTURE_FINALIZATION_FAILED', fetchImpl);
        return response(503, { status: 'ERROR', code: 'CAPTURE_FINALIZATION_FAILED' });
      }
      const finished = await finish(config, event.id, 'PROCESSED', null, fetchImpl);
      if (!finished.ok || finished.data !== true)
        return response(503, { status: 'ERROR', code: 'WEBHOOK_COMPLETION_FAILED' });
      return response(200, { status: 'PROCESSED' });
    }

    if (['PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.CAPTURE.REVERSED'].includes(event.event_type)) {
      const captureId = captureIdForReversal(event);
      const reversalStatus = event.event_type.endsWith('REFUNDED') ? 'REFUNDED' : 'REVERSED';
      const reversed = captureId ? await supabaseRpc({ config,
        name: 'gpir_reverse_paypal_capture_v2', fetchImpl,
        body: { p_paypal_capture_id: captureId, p_reversal_status: reversalStatus,
          p_environment: config.PAYMENT_ENVIRONMENT } }) : null;
      if (!reversed?.ok || reversed.data !== true) {
        await finish(config, event.id, 'ERROR', 'REVERSAL_RECONCILIATION_FAILED', fetchImpl);
        return response(503, { status: 'ERROR', code: 'REVERSAL_RECONCILIATION_FAILED' });
      }
      const finished = await finish(config, event.id, 'PROCESSED', null, fetchImpl);
      if (!finished.ok || finished.data !== true)
        return response(503, { status: 'ERROR', code: 'WEBHOOK_COMPLETION_FAILED' });
      return response(200, { status: 'PROCESSED' });
    }

    const finished = await finish(config, event.id, 'IGNORED', null, fetchImpl);
    if (!finished.ok || finished.data !== true)
      return response(503, { status: 'ERROR', code: 'WEBHOOK_COMPLETION_FAILED' });
    return response(200, { status: 'IGNORED' });
  };
}

export { captureIdForReversal, verificationBody, webhookHeaders };
