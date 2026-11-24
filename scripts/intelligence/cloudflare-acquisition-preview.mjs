import { probe, sources } from './cloudflare-acquisition-probe.mjs';
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/__gpir_acquisition_probe') return env.ASSETS.fetch(request);
    if (request.method !== 'POST') return new Response(null, {status:405});
    if (!env.GPIR_PROBE_TOKEN || request.headers.get('Authorization') !== 'Bearer ' + env.GPIR_PROBE_TOKEN)
      return new Response(null, {status:403});
    const source = url.searchParams.get('source');
    if (!Object.hasOwn(sources, source ?? '')) return new Response(null, {status:400});
    return Response.json(await probe(source), {headers:{'Cache-Control':'no-store'}});
  }
};
