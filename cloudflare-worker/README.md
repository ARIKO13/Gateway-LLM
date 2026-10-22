# Cloudflare Worker Proxy untuk DeepSeek

Hide VPS IP dari DeepSeek — DeepSeek liat IP Cloudflare (reputation tinggi), bukan IP datacenter VPS kamu.

## Kenapa butuh ini

Tanpa proxy, vinlic deepseek-api call `chat.deepseek.com` langsung dari VPS. DeepSeek liat IP `176.100.37.238` (datacenter, mudah di-block). Setelah beberapa request dalam waktu singkat → risiko IP dibanned naik.

Dengan proxy, alurnya:
```
Web app → VPS vinlic → Cloudflare Worker → DeepSeek
                          ↑ IP edge CF (clean, residence-like reputation)
```

## Setup (5 menit)

### 1. Buat Cloudflare account (kalau belum)
- Buka https://dash.cloudflare.com
- Signup free, verify email

### 2. Create Worker
- Sidebar kiri: **Workers & Pages**
- Klik **Create application** → **Create Worker**
- Beri nama: `deepseek-proxy` (atau apa pun)
- Klik **Deploy** (default hello-world dulu)
- Setelah terbuat, klik **Edit code** di kanan atas

### 3. Paste Worker script
- Hapus semua kode default (hello world)
- Buka file `worker.js` dari repo ini
- Copy semua, paste ke editor Cloudflare
- Klik **Deploy** (kanan atas)

### 4. Test Worker
```bash
# Ganti URL dengan punya kamu
curl https://deepseek-proxy.NAMAKAMU.workers.dev/api/v0/users/current \
  -H "Authorization: Bearer 1EDVrkjBDxA2ZzcmiptF1egj/VvM1sx+KJ7+uIJqpq4kClr1l8L1tGJtkUlHBYqT"
```

Expected response:
```json
{"code":0,"msg":"","data":{"biz_data":{"id":"...","email":"ars****de@gmail.com",...}}}
```

Kalau error, cek log di Cloudflare dashboard.

### 5. Update VPS pakai proxy
SSH ke VPS:
```bash
ssh root@176.100.37.238

# Set env var
echo 'DEEPSEEK_PROXY_URL=https://deepseek-proxy.NAMAKAMU.workers.dev' >> /opt/gateway-llm/.env

# Recreate container biar env var ke-load
cd /opt/gateway-llm && docker compose up -d --force-recreate --no-deps deepseek-api
```

### 6. Test chat dari VPS (sekarang via proxy)
```bash
curl -X POST https://176-100-37-238.sslip.io/deepseek/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 1EDVrkjBDxA2ZzcmiptF1egj/VvM1sx+KJ7+uIJqpq4kClr1l8L1tGJtkUlHBYqT" \
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"test"}]}'
```

Harusnya tetap jalan, tapi sekarang request ke DeepSeek lewat CF.

## Verifikasi proxy aktif

Cek log deepseek-api, request yang tadinya langsung ke `chat.deepseek.com` sekarang harusnya lewat Worker URL:
```bash
docker compose logs deepseek-api | grep -i "deepseek.com\|workers.dev"
```

## Limit free tier Cloudflare

- 100k requests/day (personal use + keep-alive cron tiap 30 menit = 48 req/day, masih jauh dari limit)
- 1000 req/min per worker
- 10ms CPU per request (streaming SSE nggak dihitung CPU, hanya transformasi)
- Untuk pemakaian personal, free tier CUKUP

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Worker exceeded CPU limit` | Worker ngapain terlalu berat | Pastikan cuma proxy, no JSON parsing |
| `fetch failed: DNS resolution` | chat.deepseek.com unreachable dari CF | Tunggu, biasanya transient |
| `522 Origin Connection Timeout` | DeepSeek nge-block IP CF tertentu | Coba deploy di region CF lain, atau switch ke workers.dev subdomain |
| Response tetap kosong / 422 | Worker nggak forward header dengan benar | Lihat log Worker di dashboard CF |

## Notes

- **Worker script** strip headers CF-specific (`cf-connecting-ip`, `cf-ray`, dll) biar DeepSeek nggak detect ini dipanggil via CF Worker
- **Worker script** add CORS headers biar web app (Pages) bisa call langsung ke Worker kalau mau
- **Host header** di-set ke `chat.deepseek.com` biar SNI matching (kalau nggak, DeepSeek bisa reject)
- **Streaming SSE** lewat Worker tanpa masalah (CF pass through ReadableStream)
- **Worker URL** selalu HTTPS, jadi VPS→Worker→DeepSeek semua encrypted

## Disable proxy (kalau mau balik direct)

```bash
# Hapus env var
sed -i '/DEEPSEEK_PROXY_URL/d' /opt/gateway-llm/.env
# Restart container
cd /opt/gateway-llm && docker compose up -d --force-recreate --no-deps deepseek-api
```
