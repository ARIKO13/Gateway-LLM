# Anti-Ban Measures — Gateway-LLM

Strategi nggak kena banned/blocked sama DeepSeek/Kimi/GLM/Qwen.

## Layer 1: Cloudflare Worker Proxy (UTAMA)

**Tujuan:** Hide IP VPS dari DeepSeek. DeepSeek liat IP Cloudflare (clean reputation), bukan IP datacenter VPS kamu.

### Setup (5 menit)
Lihat: [`cloudflare-worker/README.md`](./cloudflare-worker/README.md) + [`cloudflare-worker/worker.js`](./cloudflare-worker/worker.js)

Ringkasnya:
1. Bikin Cloudflare account (free)
2. Workers & Pages → Create Worker → paste `worker.js`
3. Deploy → catat URL Worker
4. SSH ke VPS:
   ```bash
   echo 'DEEPSEEK_PROXY_URL=https://YOUR-WORKER.workers.dev' >> /opt/gateway-llm/.env
   cd /opt/gateway-llm && docker compose up -d --force-recreate --no-deps deepseek-api
   ```
5. Done. DeepSeek sekarang nggak liat IP VPS kamu.

### Verifikasi proxy aktif
Cek log deepseek-api, request harusnya ke URL Worker:
```bash
docker compose logs deepseek-api | grep -E "deepseek.com|workers.dev"
```

### Disable proxy (kembali direct)
```bash
sed -i '/DEEPSEEK_PROXY_URL/d' /opt/gateway-llm/.env
cd /opt/gateway-llm && docker compose up -d --force-recreate --no-deps deepseek-api
```

---

## Layer 2: Keep-Alive Cron (AUTO)

**Tujuan:** Jaga token nggak idle-expired. Cron tiap 30 menit kirim "hi" ke tiap provider.

Sudah aktif sejak setup awal. Lokasi:
- Script: `/opt/gateway-llm/keepalive.sh`
- Log: `/var/log/gateway-llm-keepalive.log`
- Cron: `*/30 * * * *`

Cek log:
```bash
tail -f /var/log/gateway-llm-keepalive.log
```

Manual trigger:
```bash
bash /opt/gateway-llm/keepalive.sh
```

---

## Layer 3: Multi-Token Pooling

**Tujuan:** Distribusi request ke beberapa akun sekaligus → nggak beban 1 akun doang.

Vinlic udah support secara native via `tokenSplit` function di source-nya. Tinggal input multiple token di web UI field, dipisah koma:

```
token1,token2,token3
```

Vinlic bakal random pick salah satu per request. Secara statistik, request terbagi merata ke 3 akun → beban per akun turun 3x.

### Cara dapet multiple token
1. Bikin 2-3 akun DeepSeek (pakai Google/email berbeda)
2. Login masing-masing di tab browser berbeda (atau profile Chrome berbeda)
3. Ambil `userToken` cookie dari masing-masing akun
4. Tempel di field DeepSeek: `tokenA,tokenB,tokenC`
5. Klik Update VPS

---

## Layer 4: Jangan Polos Asli (TIPS USER)

Hal-hal yang kamu sebagai user harus jaga:

### 1. Jangan klik "Logout" di browser
Klik logout = invalidate userToken secara aktif. Token yang kamu pakai di VPS bakal mati seketika.

### 2. Pakai profile Chrome terpisah untuk grab token
Buat profile Chrome baru (atau akun Chrome berbeda) khusus buat grab token AI. Login di sana, ambil cookie, jangan tutup tab browser-nya.

### 3. Jangan hammer chat.deepseek.com manual saat grab token
Login → kirim 1 pesan → ambil cookie → tutup F12. Jangan klik-klik sana sini.

### 4. Setelah token work, JANGAN test 100x berturut-turut
Itu yang bikin token `1EDVrkjBDxA2...` ke-banned. Pakai 1-2 test request buat verify, lalu biarkan keep-alive cron yang jaga.

### 5. Jangan share token ke siapa pun
Token = akses ke akun DeepSeek kamu. Siapa pun yang pegang bisa pakai (atau abuse sampai ke-banned).

---

## Layer 5: Rate Limiting (TODO — belum diimplementasi di Caddy)

Caddy stock nggak punya rate_limit directive. Buat enable rate limit per-IP, butuh plugin `mholt/caddy-ratelimit` (custom Docker image).

### Implementasi (kalau mau, future enhancement)

Build custom Caddy image:
```dockerfile
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/mholt/caddy-ratelimit
FROM caddy:2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
```

Update Caddyfile:
```
handle_path /deepseek/* {
    rate_limit {
        zone deepseek_zone {
            key {remote_host}
            events 10
            window 1m
        }
    }
    reverse_proxy deepseek-api:8000
}
```

Alternative: pakai Nginx di depan Caddy dengan `limit_req_zone`.

---

## Summary layer yang AKTIF vs TODO

| Layer | Status | File/Lokasi |
|-------|--------|-------------|
| CF Worker Proxy | ✅ Code ready, tunggu user deploy worker-nya | `cloudflare-worker/worker.js` |
| Keep-Alive Cron | ✅ Aktif jalan tiap 30 menit | `/opt/gateway-llm/keepalive.sh` |
| Multi-Token Pooling | ✅ Vinlic native support, tinggal pakai | Web UI field (input koma-separated) |
| Tips User | ✅ User-side, no code change | Dokumen ini |
| Rate Limit Caddy | ⚠️ TODO — butuh custom image | Future enhancement |

---

## Cara test semua layer setelah setup

Setelah dapat token baru + deploy CF Worker:

```bash
ssh root@176.100.37.238

# 1. Test direct chat (vinlic → CF Worker → DeepSeek)
curl -X POST https://176-100-37-238.sslip.io/deepseek/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <fresh_userToken>" \
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"test"}]}'

# 2. Lihat log keep-alive
tail -f /var/log/gateway-llm-keepalive.log

# 3. Cek env DEEPSEEK_PROXY_URL
docker exec deepseek-api env | grep DEEPSEEK_PROXY_URL
# Expected: DEEPSEEK_PROXY_URL=https://YOUR-WORKER.workers.dev
```

Kalau response 200 + content DeepSeek → semua layer jalan. IP VPS kamu nggak keliatan sama DeepSeek.
