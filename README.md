# Gateway-LLM

Static web UI for multi-provider LLM routing. Hosted on GitHub Pages.

Live demo setelah deploy: **https://ariko13.github.io/Gateway-LLM/**

## 🎯 Apa ini?

Single-page web app (vanilla HTML/CSS/JS, **no build step**, **no backend**) yang berfungsi sebagai:

1. **Session manager** — input token/cookie untuk Kimi, DeepSeek, GLM, Qwen. Disimpan di `localStorage` browser, tidak pernah dikirim ke server mana pun selain VPS kamu sendiri.
2. **API endpoint generator** — setelah sesi diisi + VPS URL diset, endpoint OpenAI-compatible otomatis ke-generate (`POST /kimi/v1/chat/completions`, dst.).
3. **Code snippet generator** — Python / JavaScript / cURL, copy-paste ready.
4. **Chat test interface** — test langsung ke VPS lewat browser. Pakai CORS yang sudah dikonfigurasi di Caddyfile.
5. **Deploy package generator** — download `docker-compose.yml` + `.env` (pre-filled dengan token kamu) + `Caddyfile` + `deploy.sh` + `README.md`. Tinggal `scp` ke VPS dan `bash deploy.sh`.

## 📦 Isi repository

```
Gateway-LLM/
├── index.html      # Struktur halaman (single page)
├── styles.css      # Dark theme, responsive
├── app.js          # Logic: state, render, fetch, download
├── .nojekyll       # Disable Jekyll processing di GitHub Pages
└── README.md       # Dokumen ini
```

Tidak ada dependency. Tidak ada framework. Tidak ada build step. langsung jalan di GitHub Pages.

## 🚀 Deploy ke GitHub Pages

### Cara cepat (lewat Web UI GitHub)

1. **Buat repo baru** di https://github.com/new
   - Repository name: `Gateway-LLM`
   - Visibility: **Public** (Pages free tier wajib public)
   - **JANGAN** centang "Add README" — biar kosong
   - Klik **Create repository**

2. **Upload 4 file** ini lewat web UI:
   - https://github.com/ARIKO13/Gateway-LLM/upload/main
   - Drag-drop: `index.html`, `styles.css`, `app.js`, `.nojekyll`
   - Commit message: `init`
   - Klik **Commit changes**

3. **Enable Pages**:
   - https://github.com/ARIKO13/Gateway-LLM/settings/pages
   - **Source**: Deploy from a branch
   - **Branch**: `main` / `(root)`
   - Klik **Save**

4. **Tunggu 1-2 menit**, lalu buka:
   ```
   https://ariko13.github.io/Gateway-LLM/
   ```

### Cara git (kalau pakai terminal)

```bash
# Clone repo yang sudah dibuat di web UI (langkah 1 di atas)
git clone https://github.com/ARIKO13/Gateway-LLM.git
cd Gateway-LLM

# Copy file dari paket ini ke repo
cp /path/ke/index.html .
cp /path/ke/styles.css .
cp /path/ke/app.js .
cp /path/ke/.nojekyll .

# Commit + push
git add .
git commit -m "init: static web UI"
git push origin main
```

Setelah push, lanjut ke langkah 3 (Enable Pages) di atas.

## 🎨 Cara pakai web app

Setelah situs jalan di Pages:

### Step 1 — Isi VPS URL
- Di section 1, masukkan URL VPS kamu (mis: `https://api.domainmu.com` atau `http://123.45.67.89`)
- Klik **Simpan**, lalu **Test Koneksi**
- Kalau hijau → VPS online + CORS aktif

### Step 2 — Input sesi provider
- Di section 2, isi token/cookie per provider yang kamu punya
- Klik **Simpan** per provider
- Klik **Test** untuk verifikasi token masih valid

### Step 3 — Lihat API endpoint
- Section 3 auto-update dengan URL lengkap (`POST https://api.domainmu.com/kimi/v1/chat/completions`, dst.)

### Step 4 — Copy code snippet
- Section 4, pilih bahasa (Python/JS/cURL) + provider
- Klik **Copy**, paste ke project kamu

### Step 5 — Test chat live
- Section 5, pilih provider + model
- Ketik pesan, tekan **Ctrl+Enter** atau klik **Kirim**
- Response muncul di chat history (persistent per provider di localStorage)

### Step 6 — Download deploy package (kalau belum deploy VPS)
- Section 6, isi `Domain` (opsional) + `VPS IP` (wajib kalau tanpa domain)
- Klik **Download Semua (5 file)**
- `scp` semua file ke VPS, lalu `sudo bash deploy.sh`

## 🛡️ Privacy & Security

- **Tidak ada backend** — web app ini murni static. Tidak ada server yang menerima token kamu.
- Token disimpan di `localStorage` browser kamu. Klik **Clear** per provider untuk hapus.
- Saat test koneksi atau chat, request `fetch()` dikirim **langsung** dari browser ke VPS yang kamu set — tidak via proxy mana pun.
- Repo ini **PUBLIC** (wajib untuk Pages free). Pastikan kamu **TIDAK** commit file `.env` ke repo ini.
- VPS endpoint dihasilkan tanpa auth. Tambah `basic_auth` di Caddyfile kalau mau dipublik.

## 🔧 Architecture

```
┌──────────────────────────────┐
│  GitHub Pages (static)       │  ← ariko13.github.io/Gateway-LLM
│  ├─ index.html               │
│  ├─ styles.css               │
│  └─ app.js                   │
│      └─ localStorage          │  ← token persistence
└────────────┬─────────────────┘
             │ fetch() direct (CORS enabled on VPS)
             ▼
┌──────────────────────────────┐
│  VPS kamu                    │
│  ├─ Caddy (HTTPS + CORS)     │
│  └─ Docker containers        │
│     ├─ kimi-api:8000         │  ← vinlic/kimi-free-api
│     ├─ deepseek-api:8000     │  ← vinlic/deepseek-free-api
│     ├─ glm-api:8000          │  ← vinlic/glm-free-api
│     └─ qwen-api:8000         │  ← vinlic/qwen-free-api
└──────────────────────────────┘
```

## 🎛️ Customization

### Ganti warna tema
Edit `styles.css` bagian `:root`:
```css
--bg: #0a0e1a;        /* background utama */
--accent: #6366f1;     /* warna highlight */
```

### Tambah provider baru
Edit `app.js` bagian `PROVIDERS`:
```js
const PROVIDERS = {
  kimi: { ... },
  deepseek: { ... },
  glm: { ... },
  qwen: { ... },
  // Tambah:
  minimax: {
    name: 'MiniMax',
    vendor: 'MiniMax',
    envVar: 'MINIMAX_COOKIE',
    tokenLabel: 'Cookie Header',
    tokenPlaceholder: '...',
    tokenHelp: '...',
    loginUrl: 'https://hailuo.ai',
    models: ['abab6.5s-chat', 'abab6.5g-chat'],
    defaultModel: 'abab6.5s-chat',
    pathPrefix: '/minimax',
  },
};
```
Lalu update `docker-compose.yml` template (di `genDockerCompose()` di `app.js`) dan `Caddyfile` template (`genCaddyfile()`).

## 📚 Reference

- Backend images: https://hub.docker.com/u/vinlic
- Maintainer upstream: https://github.com/vinlic
- Original org: https://github.com/LLM-Red-Team
- Caddy docs: https://caddyserver.com/docs/
- OpenAI API spec: https://platform.openai.com/docs/api-reference

---

**Disclaimer**: Proyek ini mereverse-engineer antarmuka web masing-masing provider. Kemungkinan melanggar ToS provider. Risiko ditanggung pengguna. Untuk riset/edukasi. Jangan dipakai komersial.
