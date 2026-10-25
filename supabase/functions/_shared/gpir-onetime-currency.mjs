// Independent, sandbox-only one-time checkout currency primitives.
// This module contains no prices, secrets, or subscription dependencies.
export const ONETIME_CURRENCIES = Object.freeze(['USD', 'EUR', 'GBP', 'SGD', 'AUD', 'JPY', 'CAD']);
const DECIMALS = Object.freeze({ USD: 2, EUR: 2, GBP: 2, SGD: 2, AUD: 2, JPY: 0, CAD: 2 });

export function isSupportedCurrency(currency) {
  return typeof currency === 'string' &&
    Object.prototype.hasOwnProperty.call(DECIMALS, currency);
}

export function formatPayPalAmount(currency, minorUnits) {
  if (!isSupportedCurrency(currency) ||
      !Number.isSafeInteger(minorUnits) || minorUnits <= 0) return null;
  const decimals = DECIMALS[currency];
  if (decimals === 0) return String(minorUnits);
  const factor = 10 ** decimals;
  return `${Math.floor(minorUnits / factor)}.${String(minorUnits % factor).padStart(decimals, '0')}`;
}

export function parsePayPalAmount(currency, value) {
  if (!isSupportedCurrency(currency) || typeof value !== 'string') return null;
  const decimals = DECIMALS[currency];
  const expression = decimals === 0 ? /^(?:0|[1-9]\d*)$/ : /^(?:0|[1-9]\d*)\.\d{2}$/;
  if (!expression.test(value)) return null;
  const parts = value.split('.');
  const whole = Number(parts[0]);
  const fraction = decimals === 0 ? 0 : Number(parts[1]);
  const minor = whole * 10 ** decimals + fraction;
  return Number.isSafeInteger(minor) && minor > 0 &&
    formatPayPalAmount(currency, minor) === value ? minor : null;
}

export function sandboxOnetimeEnabled(env) {
  if (env?.ONETIME_CHECKOUT_ENABLED !== 'true' ||
      env?.PAYPAL_ENV !== 'sandbox') return false;
  try {
    const url = new URL(env.SUPABASE_URL);
    return url.protocol === 'https:' &&
      url.hostname === 'hoewtptllwkcqrgryazu.supabase.co' &&
      url.pathname === '/' &&
      (!env.PAYPAL_BASE_URL || env.PAYPAL_BASE_URL === 'https://api-m.sandbox.paypal.com');
  } catch { return false; }
}
