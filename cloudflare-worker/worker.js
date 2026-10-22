/**
 * Cloudflare Worker: Multi-Provider LLM Proxy
 *
 * Route by path prefix:
 *   /deepseek/*  → https://chat.deepseek.com
 *   /kimi/*      → https://kimi.moonshot.cn
 *   /glm/*       → https://chatglm.cn
 *   /qwen/*      → https://tongyi.aliyun.com
 *
 * Deploy (sama seperti versi single-provider):
 * 1. Cloudflare dashboard → Workers & Pages → Create Worker
 * 2. Beri nama: llm-proxy (atau apa pun)
 * 3. Hapus default code, paste semua kode ini
 * 4. Deploy → catat URL (https://llm-proxy.kamu.workers.dev)
 *
 * Setup di VPS (setiap provider punya env var sendiri):
 *   ssh root@176.100.37.238
 *   cat >> /opt/gateway-llm/.env <<EOF
 *   DEEPSEEK_PROXY_URL=https://llm-proxy.kamu.workers.dev/deepseek
 *   KIMI_PROXY_URL=https://llm-proxy.kamu.workers.dev/kimi
 *   GLM_PROXY_URL=https://llm-proxy.kamu.workers.dev/glm
 *   QWEN_PROXY_URL=https://llm-proxy.kamu.workers.dev/qwen
 *   EOF
 *   cd /opt/gateway-llm && docker compose up -d --force-recreate
 *
 * Test:
 *   curl https://llm-proxy.kamu.workers.dev/deepseek/api/v0/users/current \
 *     -H "Authorization: Bearer <deepseek_userToken>"
 *   curl https://llm-proxy.kamu.workers.dev/kimi/api/auth/token/refresh \
 *     -H "Authorization: Bearer <kimi_refresh_token>"
 *
 * Stripping logic:
 *   Request path /deepseek/api/v0/users/current
 *   → strip "/deepseek" prefix
 *   → proxy to https://chat.deepseek.com/api/v0/users/current
 *   Host header set to chat.deepseek.com biar SNI matching
 */

const PROVIDERS = {
  '/deepseek/': { origin: 'https://chat.deepseek.com', host: 'chat.deepseek.com' },
  '/kimi/':     { origin: 'https://kimi.moonshot.cn',   host: 'kimi.moonshot.cn' },
  '/glm/':      { origin: 'https://chatglm.cn',         host: 'chatglm.cn' },
  '/qwen/':     { origin: 'https://tongyi.aliyun.com',  host: 'tongyi.aliyun.com' },
};

// Headers yang otomatis ditambah Cloudflare ke outbound request.
// Strip supaya target nggak detect dipanggil via Worker.
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

function findProvider(pathname) {
  for (const [prefix, config] of Object.entries(PROVIDERS)) {
    if (pathname.startsWith(prefix)) {
      // Strip prefix, keep leading slash
      // e.g., /deepseek/api/v0/users/current → /api/v0/users/current
      const stripped = pathname.slice(prefix.length - 1);
      return { config, strippedPath: stripped };
    }
  }
  return null;
}

export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const found = findProvider(url.pathname);

      if (!found) {
        return new Response(JSON.stringify({
          error: 'unknown_provider',
          message: `Path must start with one of: ${Object.keys(PROVIDERS).join(', ')}`,
          path_received: url.pathname,
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const { config, strippedPath } = found;
      const targetUrl = config.origin + strippedPath + url.search;

      // Build proxy headers
      const proxyHeaders = new Headers(request.headers);
      for (const h of STRIP_REQUEST_HEADERS) {
        proxyHeaders.delete(h);
      }
      proxyHeaders.set('Host', config.host);

      const proxyReq = new Request(targetUrl, {
        method: request.method,
        headers: proxyHeaders,
        body: (request.method === 'GET' || request.method === 'HEAD') ? undefined : request.body,
        redirect: 'manual',
      });

      const response = await fetch(proxyReq);

      // Build response headers
      const respHeaders = new Headers(response.headers);
      for (const h of STRIP_RESPONSE_HEADERS) {
        respHeaders.delete(h);
      }
      respHeaders.set('Access-Control-Allow-Origin', '*');
      respHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      respHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: respHeaders });
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: respHeaders,
      });
    } catch (err) {
      return new Response(JSON.stringify({
        error: 'proxy_failed',
        message: err.message,
        stack: err.stack,
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
};
