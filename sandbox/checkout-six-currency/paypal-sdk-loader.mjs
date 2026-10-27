export const CHECKOUT_CURRENCIES = Object.freeze(['USD', 'EUR', 'GBP', 'SGD', 'AUD', 'CAD']);

function namespaceFor(currency) {
  if (!CHECKOUT_CURRENCIES.includes(currency)) throw new Error('UNSUPPORTED_CURRENCY');
  return `paypalGpir${currency}`;
}

function validSdk(value) {
  return value && typeof value.Buttons === 'function' && value.FUNDING &&
    typeof value.FUNDING === 'object';
}

export function createPayPalSdkLoader({ global = window, document = global.document } = {}) {
  const loads = new Map();

  return function loadPayPalSdk({ clientId, currency }) {
    if (typeof clientId !== 'string' || !clientId) return Promise.reject(
      new Error('PAYPAL_CLIENT_ID_REQUIRED'));
    const namespace = namespaceFor(currency);
    if (validSdk(global[namespace])) return Promise.resolve(global[namespace]);
    if (loads.has(namespace)) return loads.get(namespace);

    const script = document.createElement('script');
    script.async = true;
    script.id = `gpir-paypal-sdk-${currency.toLowerCase()}`;
    script.dataset.namespace = namespace;
    script.dataset.paypalSdkCurrency = currency;
    script.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(clientId) +
      '&currency=' + encodeURIComponent(currency) +
      '&intent=capture&components=buttons,funding-eligibility';

    const loaded = new Promise((resolve, reject) => {
      script.addEventListener('load', () => {
        if (!validSdk(global[namespace])) {
          loads.delete(namespace);
          script.remove?.();
          reject(new Error('PAYPAL_SDK_UNAVAILABLE'));
          return;
        }
        resolve(global[namespace]);
      }, { once: true });
      script.addEventListener('error', () => {
        loads.delete(namespace);
        script.remove?.();
        reject(new Error('PAYPAL_SDK_UNAVAILABLE'));
      }, { once: true });
    });
    loads.set(namespace, loaded);
    try { document.head.appendChild(script); }
    catch (error) { loads.delete(namespace); script.remove?.(); return Promise.reject(error); }
    return loaded;
  };
}

export function createLatestRenderGuard() {
  let latest = 0;
  return Object.freeze({
    begin() { latest += 1; return latest; },
    isCurrent(revision) { return revision === latest; }
  });
}

export { namespaceFor };
