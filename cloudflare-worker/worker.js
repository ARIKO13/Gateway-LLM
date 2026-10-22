/**
 * Cloudflare Worker: DeepSeek Proxy
 *
 * Tujuan: Hide VPS IP dari DeepSeek. VPS call Worker ini, Worker call DeepSeek
 * pakai IP edge Cloudflare (reputation lebih tinggi dari IP datacenter).
 *
 * Deploy:
 * 1. Login ke https://dash.cloudflare.com (signup free kalau belum punya)
 * 2. Kiri: Workers & Pages → Create application → Worker → Create Worker
 * 3. Beri nama: deepseek-proxy (atau apa pun)
 * 4. Hapus kode hello-world default, paste semua kode ini
 * 5. Klik "Deploy" di kanan atas
 * 6. Setelah deploy, buka tab "Settings" → "Triggers"
 * 7. Catat URL worker (misal: https://deepseek-proxy.namakamu.workers.dev)
 * 8. SSH ke VPS:
 *      echo 'DEEPSEEK_PROXY_URL=https://deepseek-proxy.namakamu.workers.dev' >> /opt/gateway-llm/.env
 *      cd /opt/gateway-llm && docker compose up -d --force-recreate --no-deps deepseek-api
 *
 * Free tier Cloudflare Workers:
 * - 100,000 requests/day (cukup untuk personal use + keep-alive cron)
 * - 1000 req/min per worker
 * - 10ms CPU per request (streaming I/O nggak dihitung)
 *
 * Cara test Worker (setelah deploy):
 *   curl https://deepseek-proxy.namakamu.workers.dev/api/v0/users/current \
 *     -H "Authorization: Bearer <token>"
 *   → harus return user info DeepSeek
 */

const TARGET_ORIGIN = 'https://chat.deepseek.com';

const STRIP_REQUEST_HEADERS = [
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
  'cf-worker',
  'cf-ew-via',
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-real-ip',
  'true-client-ip',
];

const STRIP_RESPONSE_HEADERS = [
  'cf-cache-status',
  'cf-ray',
  'cf-warp-tag',
];

export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const targetUrl = TARGET_ORIGIN + url.pathname + url.search;

      const proxyHeaders = new Headers(request.headers);
      for (const h of STRIP_REQUEST_HEADERS) {
        proxyHeaders.delete(h);
      }
      proxyHeaders.set('Host', 'chat.deepseek.com');

      const proxyReq = new Request(targetUrl, {
        method: request.method,
        headers: proxyHeaders,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
        redirect: 'manual',
      });

      const response = await fetch(proxyReq);

      const respHeaders = new Headers(response.headers);
      for (const h of STRIP_RESPONSE_HEADERS) {
        respHeaders.delete(h);
      }
      respHeaders.set('Access-Control-Allow-Origin', '*');
      respHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      respHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: respHeaders });
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: respHeaders,
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'proxy_failed', message: err.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
};
