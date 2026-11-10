const COUNTRY_REGISTRY = new URL('../data/country-intelligence.json', import.meta.url);

export async function loadCountryRegistry(fetchImpl = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(COUNTRY_REGISTRY.href, { signal: controller.signal });
    if (!response.ok) throw new Error(`COUNTRY_REGISTRY_HTTP_${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data?.records)) throw new Error('INVALID_COUNTRY_REGISTRY');
    return data.records;
  } finally {
    clearTimeout(timeout);
  }
}

export function resolveEventGeography(event, countries) {
  const scope = typeof event?.region === 'string' ? event.region.trim() : '';
  if (/^(global|worldwide)$/i.test(scope))
    return { country: '', countryCode: '', region: 'Global', flagUrl: '' };
  const code = typeof event?.countryCode === 'string' ? event.countryCode.trim().toUpperCase() : '';
  const country = /^[A-Z]{2}$/.test(code)
    ? countries.find(item => item.isoAlpha2 === code && item.publicationStatus === 'PUBLISHED') : null;
  return {
    country: country?.name || '',
    countryCode: country ? code : '',
    region: country?.region || scope,
    flagUrl: country ? new URL(`../icons/flags/${code.toLowerCase()}.svg`, import.meta.url).href : ''
  };
}

export function countryFlagMarkup(flagUrl) {
  if (!flagUrl) return '';
  const url = new URL(flagUrl);
  if (url.origin !== new URL(import.meta.url).origin || !/\/assets\/icons\/flags\/[a-z]{2}\.svg$/.test(url.pathname))
    throw new Error('INVALID_COUNTRY_FLAG_URL');
  return `<img src="${url.href}" alt="" width="18" height="12" loading="lazy" style="vertical-align:middle"> `;
}
