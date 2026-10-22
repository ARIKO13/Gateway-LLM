# Cloudflare Worker: Multi-Provider LLM Proxy

Hide IP VPS dari DeepSeek, Kimi, GLM, dan Qwen dalam **1 Worker**.

## Arsitektur

```
Web app → VPS vinlic (4 containers) → CF Worker → provider asli
                                       ├─ /deepseek/* → chat.deepseek.com
                                       ├─ /kimi/*     → kimi.moonshot.cn
                                       ├─ /glm/*      → chatglm.cn
                                       └─ /qwen/*     → tongyi.aliyun.com
```

Worker route by path prefix, strip prefix, proxy ke origin. Host header di-set per-provider biar SNI matching.

## Setup (5 menit)

### 1. Buat Cloudflare account
- https://dash.cloudflare.com → signup free, verify email

### 2. Create Worker
- Sidebar kiri: **Workers & Pages**
- Klik **Create application** → **Create Worker**
- Beri nama: `llm-proxy` (atau apa pun)
- Klik **Deploy** (default hello-world dulu)
- Klik **Edit code**

### 3. Paste Worker script
- Hapus semua kode default
- Buka file `worker.js` dari folder `cloudflare-worker/` di repo ini
- Copy semua, paste ke editor Cloudflare
- Klik **Deploy** di kanan atas

### 4. Test Worker (per provider, kalau udah punya token)
```bash
# DeepSeek
curl https://llm-proxy.NAMAKAMU.workers.dev/deepseek/api/v0/users/current \
  -H "Authorization: Bearer <deepseek_userToken>"

# Kimi (refresh token test, expected: JSON error karena butuh POST body, tapi status 200)
curl https://llm-proxy.NAMAKAMU.workers.dev/kimi/api/auth/token/refresh \
  -H "Authorization: Bearer <kimi_refresh_token>"

# 404 kalau path nggak match prefix manapun
curl https://llm-proxy.NAMAKAMU.workers.dev/foo/bar
# → {"error":"unknown_provider","message":"Path must start with: /deepseek/, /kimi/, /glm/, /qwen/"}
```

### 5. Set env vars di VPS
```bash
ssh root@176.100.37.238

cat >> /opt/gateway-llm/.env <<EOF
DEEPSEEK_PROXY_URL=https://llm-proxy.NAMAKAMU.workers.dev/deepseek
KIMI_PROXY_URL=https://llm-proxy.NAMAKAMU.workers.dev/kimi
GLM_PROXY_URL=https://llm-proxy.NAMAKAMU.workers.dev/glm
QWEN_PROXY_URL=https://llm-proxy.NAMAKAMU.workers.dev/qwen
EOF

# Recreate semua container biar env var ke-load
cd /opt/gateway-llm && docker compose up -d --force-recreate
```

### 6. Verifikasi proxy aktif
```bash
# Cek env vars di tiap container
docker exec kimi-api env | grep PROXY_URL
docker exec glm-api env | grep PROXY_URL
docker exec qwen-api env | grep PROXY_URL
docker exec deepseek-api env | grep PROXY_URL

# Expected output (per provider):
# KIMI_PROXY_URL=https://llm-proxy.kamu.workers.dev/kimi
# ...dst
```

### 7. Test chat end-to-end
```bash
# DeepSeek
curl -X POST https://176-100-37-238.sslip.io/deepseek/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <deepseek_userToken>" \
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"halo"}]}'

# Kalau response berisi "content": "..." → semua jalan:
# VPS → CF Worker → DeepSeek (with CF IP, not VPS IP) → response → back
```

## Stripping logic (apa yang Worker hapus)

Worker menghapus headers berikut dari request ke provider asli, biar provider nggak detect ini dipanggil via Cloudflare Worker:

- `cf-connecting-ip` (IP client Worker)
- `cf-ipcountry` (negara client Worker)
- `cf-ray`, `cf-visitor`, `cf-worker` (CF-specific headers)
- `x-forwarded-for`, `x-forwarded-proto` (proxy chain)
- `x-real-ip`, `true-client-ip` (real IP headers)

Worker juga hapus headers berikut dari response balik ke client (CORS issues):
- `cf-cache-status`, `cf-ray`, `cf-warp-tag`

Plus nambahin CORS headers (`Access-Control-Allow-Origin: *`) biar web app Pages bisa call langsung ke Worker kalau mau.

## Provider-specific notes

### DeepSeek
- Origin: `https://chat.deepseek.com`
- Host header: `chat.deepseek.com`
- Vinlic patched: read `DEEPSEEK_PROXY_URL` env var, fallback direct
- **Plus 5 patches lain** buat handle DeepSeek API baru (Content-Type, getIPAddress, createSession, SSE parser, v-field handler)

### Kimi
- Origin: `https://kimi.moonshot.cn`
- Host header: `kimi.moonshot.cn`
- Vinlic patched: read `KIMI_PROXY_URL` env var
- Auth: refresh_token cookie dari kimi.com (F12 → Application → Cookies → `refresh_token`)

### GLM
- Origin: `https://chatglm.cn`
- Host header: `chatglm.cn`
- Vinlic patched: read `GLM_PROXY_URL` env var
- Auth: refresh token (F12 → Network → cari request ke `/user/refresh` → copy Bearer)

### Qwen (2 domain!)
- Main origin: `https://tongyi.aliyun.com` (`QWEN_PROXY_URL`)
- Alt origin: `https://qianwen.biz.aliyun.com` (`QWEN_BIZ_PROXY_URL` — optional, kalau nggak di-set bakal direct)
- OSS storage `https://broadscope-dialogue-new.oss-cn-beijing.aliyuncs.com` — nggak di-proxy (file upload, jarang dipakai)
- Auth: `login_aliyunid_ticket` atau `tongyi_sso_ticket` cookie value

## Disable proxy (balik direct)

Hapus env vars dari .env, recreate container:
```bash
ssh root@176.100.37.238
sed -i '/_PROXY_URL/d' /opt/gateway-llm/.env
cd /opt/gateway-llm && docker compose up -d --force-recreate
```

## Free tier Cloudflare Workers

- 100,000 requests/day (cukup untuk personal use + keep-alive cron tiap 30 menit × 4 provider = 192 req/day, jauh dari limit)
- 1000 req/min per worker
- 10ms CPU per request (streaming SSE I/O nggak dihitung CPU)
- Untuk pemakaian personal, free tier CUKUP banget

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `unknown_provider` (404) | Path nggak mulai dengan `/deepseek/`, `/kimi/`, `/glm/`, atau `/qwen/` | Cek URL env var harus ends with provider prefix (mis: `.../deepseek`, bukan `.../deepseek/`) |
| `Stream response error` di vinlic log | CF Worker timeout atau provider balas error | Cek log Worker di dashboard CF |
| `Host header mismatch` error | Provider nolak karena SNI/Host beda | Worker otomatis set Host, jangan override di vinlic |
| Response 200 tapi content kosong | Vinlic parser issue (bukan proxy issue) | Lihat log vinlic, mungkin butuh patch SSE parser seperti DeepSeek |
| Worker exceeded CPU limit | Worker ngapain terlalu berat | Pastikan cuma proxy, no JSON parsing di Worker |
| 522 Origin Connection Timeout | Provider nge-block IP CF tertentu | Coba deploy di region CF lain, atau skip proxy buat provider itu |

## Cost breakdown

- Cloudflare Workers: FREE (untuk penggunaan personal)
- VPS Hetzner/DO (1 IP): ~$5/bulan (sudah ada)
- Domain (kalau mau ganti sslip.io): ~$10/tahun (opsional)
- **Total**: $5/bulan untuk 4 LLM providers + auto-renew token via keep-alive cron

Bandung-2 di-IP-banned setiap provider tiap bulan nggak akan terjadi selama kamu:
1. Pakai CF Worker (IP edge CF, bukan IP VPS)
2. Pakai multi-token pooling (kalau punya 2+ akun)
3. Nggak hammer 1000 request per menit
4. Keep-alive cron jalan tiap 30 menit (sudah default)
