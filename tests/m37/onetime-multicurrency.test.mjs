import test from 'node:test';
import assert from 'node:assert/strict';
import { ONETIME_CURRENCIES, formatPayPalAmount, parsePayPalAmount,
  sandboxOnetimeEnabled } from '../../supabase/functions/_shared/gpir-onetime-currency.mjs';

test('seven supported currencies format and round-trip correctly', () => {
  assert.deepEqual(ONETIME_CURRENCIES, ['USD', 'EUR', 'GBP', 'SGD', 'AUD', 'JPY', 'CAD']);
  for (const currency of ONETIME_CURRENCIES) {
    const amount = formatPayPalAmount(currency, 1500);
    assert.equal(amount, currency === 'JPY' ? '1500' : '15.00');
    assert.equal(parsePayPalAmount(currency, amount), 1500);
  }
});

test('JPY rejects decimal fractions; two-decimal currencies reject integer amounts', () => {
  assert.equal(parsePayPalAmount('JPY', '1500.00'), null);
  assert.equal(parsePayPalAmount('USD', '1500'), null);
  assert.equal(parsePayPalAmount('USD', '15.001'), null);
  assert.equal(formatPayPalAmount('JPY', 1500), '1500');
});

test('invalid and unsafe amounts fail closed', () => {
  for (const currency of ONETIME_CURRENCIES) {
    assert.equal(formatPayPalAmount(currency, 0), null);
    assert.equal(formatPayPalAmount(currency, -1), null);
    assert.equal(formatPayPalAmount(currency, 1.5), null);
    assert.equal(formatPayPalAmount(currency, Number.MAX_SAFE_INTEGER + 1), null);
    assert.equal(parsePayPalAmount(currency, '-1'), null);
  }
  assert.equal(formatPayPalAmount('INR', 100), null);
});

test('feature remains disabled unless Sandbox environment, project and flag all match', () => {
  const valid = {
    ONETIME_CHECKOUT_ENABLED: 'true',
    PAYPAL_ENV: 'sandbox',
    SUPABASE_URL: 'https://hoewtptllwkcqrgryazu.supabase.co'
  };
  assert.equal(sandboxOnetimeEnabled(valid), true);
  assert.equal(sandboxOnetimeEnabled({ ...valid, ONETIME_CHECKOUT_ENABLED: 'false' }), false);
  assert.equal(sandboxOnetimeEnabled({ ...valid, PAYPAL_ENV: 'production' }), false);
  assert.equal(sandboxOnetimeEnabled({ ...valid, SUPABASE_URL: 'https://qlnvhfapctcpzqyuhhth.supabase.co' }), false);
  assert.equal(sandboxOnetimeEnabled({ ...valid, PAYPAL_BASE_URL: 'https://api-m.paypal.com' }), false);
});
