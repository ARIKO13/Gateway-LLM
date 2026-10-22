/* ============================================================
 * Gateway-LLM · Web UI logic
 * Static, client-side only. No backend, no telemetry.
 * State persisted to localStorage.
 * ============================================================ */

'use strict';

/* ============================================================
 * 1. PROVIDER METADATA
 * ============================================================ */
const PROVIDERS = {
  kimi: {
    name: 'Kimi',
    vendor: 'Moonshot AI',
    envVar: 'KIMI_REFRESH_TOKEN',
    tokenLabel: 'Refresh Token',
    tokenPlaceholder: 'eyJhbGciOiJIUzI1...',
    tokenHelp: 'Login kimi.com → F12 → Application → Cookies → https://kimi.com → cari "refresh_token" → copy value (JWT, mulai "eyJ")',
    loginUrl: 'https://kimi.com',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'kimi-latest'],
    defaultModel: 'moonshot-v1-8k',
    pathPrefix: '/kimi',
    note: 'Token tipe JWT, stabil berbulan-bulan. Lebih reliable daripada session cookie.',
  },
  deepseek: {
    name: 'DeepSeek',
    vendor: 'DeepSeek AI',
    envVar: 'DEEPSEEK_COOKIE',
    tokenLabel: 'Cookie Header',
    tokenPlaceholder: 'userToken=...; cf_clearance=...; ...',
    tokenHelp: 'Login chat.deepseek.com → F12 → Network → reload → klik request ke chat.deepseek.com → Headers → Request Headers → copy SEMUA nilai setelah "Cookie: "',
    loginUrl: 'https://chat.deepseek.com',
    models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
    pathPrefix: '/deepseek',
    note: 'Copy seluruh header Cookie, bukan satu nilai cookie saja.',
  },
  glm: {
    name: 'GLM',
    vendor: 'Zhipu AI',
    envVar: 'GLM_COOKIE',
    tokenLabel: 'Cookie Header',
    tokenPlaceholder: 'sessionID=...; token=...; ...',
    tokenHelp: 'Login chatglm.cn → F12 → Network → reload → klik request ke chatglm.cn → Headers → Request Headers → copy SEMUA nilai setelah "Cookie: "',
    loginUrl: 'https://chatglm.cn',
    models: ['glm-4', 'glm-4-flash', 'glm-4-air', 'glm-4-longcontext'],
    defaultModel: 'glm-4',
    pathPrefix: '/glm',
    note: 'GLM-4-Flash gratis, cepat. GLM-4 untuk kualitas.',
  },
  qwen: {
    name: 'Qwen',
    vendor: 'Alibaba Tongyi',
    envVar: 'QWEN_COOKIE',
    tokenLabel: 'Cookie Header',
    tokenPlaceholder: 'login_aliyid_t=...; cna=...; ...',
    tokenHelp: 'Login tongyi.aliyun.com → F12 → Network → reload → klik request ke tongyi.aliyun.com → Headers → Request Headers → copy SEMUA nilai setelah "Cookie: "',
    loginUrl: 'https://tongyi.aliyun.com',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen2-72b'],
    defaultModel: 'qwen-max',
    pathPrefix: '/qwen',
    note: 'Pakai akun Aliyun/Alipay yang sama seperti Taobao.',
  },
};

const PROVIDER_KEYS = Object.keys(PROVIDERS);

/* ============================================================
 * 2. STATE
 * ============================================================ */
const STORAGE_KEY = 'gateway-llm-state-v1';

const defaultState = {
  vpsUrl: '',
  providers: {
    kimi:     { token: '' },
    deepseek: { token: '' },
    glm:      { token: '' },
    qwen:     { token: '' },
  },
  chat: {
    kimi:     [],
    deepseek: [],
    glm:      [],
    qwen:     [],
  },
  deployConfig: {
    domain: '',
    vpsIp: '',
  },
};

let state = loadState();

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(defaultState);
    const parsed = JSON.parse(saved);
    // Merge with defaults to ensure new fields exist
    return {
      ...structuredClone(defaultState),
      ...parsed,
      providers: { ...structuredClone(defaultState.providers), ...(parsed.providers || {}) },
      chat: { ...structuredClone(defaultState.chat), ...(parsed.chat || {}) },
      deployConfig: { ...structuredClone(defaultState.deployConfig), ...(parsed.deployConfig || {}) },
    };
  } catch (e) {
    console.warn('Failed to load state, using defaults:', e);
    return structuredClone(defaultState);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save state:', e);
    toast('Gagal simpan state ke localStorage', 'error');
  }
}

/* ============================================================
 * 3. UTILITIES
 * ============================================================ */
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function toast(message, type = 'info') {
  const container = $('#toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.25s';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    return Promise.resolve();
  } catch (e) {
    return Promise.reject(e);
  } finally {
    document.body.removeChild(ta);
  }
}

function downloadFile(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function normalizeVpsUrl(url) {
  if (!url) return '';
  url = url.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  // Strip trailing slash
  url = url.replace(/\/+$/, '');
  return url;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ============================================================
 * 4. RENDER: VPS STATUS PILL
 * ============================================================ */
function renderVpsStatus() {
  const pill = $('#vpsStatus');
  const dot = pill.querySelector('.dot');
  const text = pill.querySelector('.status-text');
  if (state.vpsUrl) {
    dot.className = 'dot dot-green';
    text.textContent = 'VPS: ' + state.vpsUrl.replace(/^https?:\/\//, '');
  } else {
    dot.className = 'dot dot-gray';
    text.textContent = 'VPS belum diset';
  }
}

/* ============================================================
 * 5. RENDER: PROVIDER CARDS
 * ============================================================ */
function renderProviderCards() {
  const grid = $('#providerGrid');
  grid.innerHTML = '';

  for (const key of PROVIDER_KEYS) {
    const p = PROVIDERS[key];
    const token = state.providers[key]?.token || '';
    const hasToken = Boolean(token);

    const card = document.createElement('div');
    card.className = 'provider-card' + (hasToken ? ' has-token' : '');
    card.innerHTML = `
      <div class="provider-card-header">
        <div class="provider-card-title">
          <strong>${p.name}</strong>
          <small>${p.vendor}</small>
        </div>
        <div class="provider-card-status">${hasToken ? '✓ terisi' : 'kosong'}</div>
      </div>
      <input
        type="password"
        id="token-${key}"
        placeholder="${escapeHtml(p.tokenPlaceholder)}"
        value="${escapeHtml(token)}"
        autocomplete="off"
        spellcheck="false"
      />
      <div class="provider-card-actions">
        <button class="btn btn-primary" data-action="save" data-provider="${key}">Simpan</button>
        <button class="btn btn-ghost" data-action="test" data-provider="${key}">Test</button>
        <button class="btn btn-ghost" data-action="clear" data-provider="${key}">Clear</button>
      </div>
      <div class="provider-help">
        ${escapeHtml(p.tokenHelp)} · <a href="${p.loginUrl}" target="_blank" rel="noopener">Buka ${p.loginUrl}</a>
      </div>
    `;
    grid.appendChild(card);
  }

  // Bind buttons
  grid.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = btn.dataset.action;
      const provider = btn.dataset.provider;
      const input = grid.querySelector(`#token-${provider}`);
      if (action === 'save') {
        const value = input.value.trim();
        state.providers[provider].token = value;
        saveState();
        renderProviderCards();
        renderEndpoints();
        renderSnippet();
        toast(`${PROVIDERS[provider].name}: token disimpan`, 'success');
      } else if (action === 'test') {
        testProvider(provider);
      } else if (action === 'clear') {
        if (!confirm(`Hapus token ${PROVIDERS[provider].name}?`)) return;
        state.providers[provider].token = '';
        input.value = '';
        saveState();
        renderProviderCards();
        renderEndpoints();
        renderSnippet();
        toast(`${PROVIDERS[provider].name}: token dihapus`, 'info');
      }
    });
  });
}

/* ============================================================
 * 6. RENDER: API ENDPOINTS
 * ============================================================ */
function renderEndpoints() {
  const list = $('#endpointList');
  list.innerHTML = '';
  const baseUrl = state.vpsUrl || 'https://<VPS-URL>';

  for (const key of PROVIDER_KEYS) {
    const p = PROVIDERS[key];
    const hasToken = Boolean(state.providers[key]?.token);
    const item = document.createElement('div');
    item.className = 'endpoint-item' + (hasToken ? '' : ' unconfigured');
    item.innerHTML = `
      <div class="endpoint-name">${p.name}</div>
      <div class="endpoint-url">${baseUrl}${p.pathPrefix}/v1/chat/completions</div>
      <div class="endpoint-method">POST</div>
    `;
    list.appendChild(item);
  }

  // Add the /v1/models endpoint too (status page)
  const statusItem = document.createElement('div');
  statusItem.className = 'endpoint-item';
  statusItem.innerHTML = `
    <div class="endpoint-name">Status</div>
    <div class="endpoint-url">${baseUrl}/</div>
    <div class="endpoint-method">GET</div>
  `;
  list.appendChild(statusItem);
}

/* ============================================================
 * 7. RENDER: CODE SNIPPETS
 * ============================================================ */
function renderSnippet() {
  const lang = $('#snippetLang').value;
  const providerKey = $('#snippetProvider').value;
  const p = PROVIDERS[providerKey];
  const baseUrl = state.vpsUrl || 'https://<VPS-URL>';
  const endpoint = `${baseUrl}${p.pathPrefix}/v1`;
  const model = p.defaultModel;

  let snippet = '';
  if (lang === 'python') {
    snippet = `from openai import OpenAI

client = OpenAI(
    base_url="${endpoint}",
    api_key="not-needed"   # tidak perlu API key
)

response = client.chat.completions.create(
    model="${model}",
    messages=[
        {"role": "system", "content": "Kamu asisten yang helpful."},
        {"role": "user", "content": "Halo, jelaskan diri kamu singkat."}
    ]
)
print(response.choices[0].message.content)`;
  } else if (lang === 'javascript') {
    snippet = `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${endpoint}",
  apiKey: "not-needed"
});

const response = await client.chat.completions.create({
  model: "${model}",
  messages: [
    { role: "system", content: "Kamu asisten yang helpful." },
    { role: "user", content: "Halo, jelaskan diri kamu singkat." }
  ]
});

console.log(response.choices[0].message.content);`;
  } else if (lang === 'curl') {
    snippet = `curl -X POST ${endpoint}/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "messages": [
      {"role": "user", "content": "Halo, jelaskan diri kamu singkat."}
    ]
  }'`;
  }

  $('#snippetOutput').textContent = snippet;
}

/* ============================================================
 * 8. RENDER: CHAT (model dropdown)
 * ============================================================ */
function renderChatModelOptions() {
  const providerKey = $('#chatProvider').value;
  const p = PROVIDERS[providerKey];
  const select = $('#chatModel');
  select.innerHTML = p.models.map(m =>
    `<option value="${m}">${m}</option>`
  ).join('');
}

function renderChatHistory() {
  const providerKey = $('#chatProvider').value;
  const history = state.chat[providerKey] || [];
  const container = $('#chatHistory');

  if (history.length === 0) {
    container.innerHTML = '<div class="chat-empty">Pilih provider, ketik pesan, lalu kirim.</div>';
    return;
  }

  container.innerHTML = '';
  for (const msg of history) {
    const div = document.createElement('div');
    div.className = `chat-message ${msg.role}`;
    const avatar = msg.role === 'user' ? '🧑' : msg.role === 'assistant' ? '🤖' : '⚠';
    div.innerHTML = `
      <div class="chat-avatar">${avatar}</div>
      <div class="chat-bubble">${escapeHtml(msg.content)}</div>
    `;
    container.appendChild(div);
  }
  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

/* ============================================================
 * 9. ACTIONS: TEST VPS
 * ============================================================ */
async function testVpsConnection() {
  if (!state.vpsUrl) {
    toast('Isi VPS URL dulu', 'warn');
    return;
  }
  const url = state.vpsUrl + '/';
  toast('Mencoba koneksi ke ' + url + ' ...', 'info');
  try {
    const resp = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(8000) });
    if (resp.ok) {
      const data = await resp.json().catch(() => null);
      if (data && data.status === 'ok') {
        toast('✓ VPS reachable. Providers: ' + (data.providers || []).join(', '), 'success');
      } else {
        toast('✓ VPS reachable (HTTP ' + resp.status + ')', 'success');
      }
    } else {
      toast('VPS balas HTTP ' + resp.status, 'warn');
    }
  } catch (err) {
    const msg = err.name === 'TimeoutError' ? 'timeout (8s)' : (err.message || 'gagal');
    toast('✗ VPS unreachable: ' + msg + '. Cek URL / CORS / firewall.', 'error');
  }
}

/* ============================================================
 * 10. ACTIONS: TEST PROVIDER
 * ============================================================ */
async function testProvider(providerKey) {
  if (!state.vpsUrl) {
    toast('Isi VPS URL dulu di section 1', 'warn');
    return;
  }
  if (!state.providers[providerKey]?.token) {
    toast(`Isi token ${PROVIDERS[providerKey].name} dulu`, 'warn');
    return;
  }
  const p = PROVIDERS[providerKey];
  const url = `${state.vpsUrl}${p.pathPrefix}/v1/models`;
  toast(`Test ${p.name} → GET ${url}`, 'info');
  try {
    const resp = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(10000) });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      toast(`✗ ${p.name} HTTP ${resp.status}: ${text.slice(0,80)}`, 'error');
      return;
    }
    const data = await resp.json().catch(() => null);
    const modelCount = data?.data?.length || 0;
    toast(`✓ ${p.name} OK — ${modelCount} model tersedia`, 'success');
  } catch (err) {
    const msg = err.name === 'TimeoutError' ? 'timeout (10s)' : (err.message || 'gagal');
    toast(`✗ ${p.name} gagal: ${msg}`, 'error');
  }
}

/* ============================================================
 * 11. ACTIONS: SEND CHAT
 * ============================================================ */
async function sendChat() {
  const providerKey = $('#chatProvider').value;
  const model = $('#chatModel').value;
  const input = $('#chatInput');
  const message = input.value.trim();

  if (!message) return;
  if (!state.vpsUrl) {
    toast('Isi VPS URL dulu di section 1', 'warn');
    return;
  }
  if (!state.providers[providerKey]?.token) {
    toast(`Isi token ${PROVIDERS[providerKey].name} dulu`, 'warn');
    return;
  }

  // Push user message
  state.chat[providerKey].push({ role: 'user', content: message });
  saveState();
  input.value = '';
  renderChatHistory();

  // Add loading bubble
  const loadingMsg = { role: 'loading', content: '⏳ menunggu respons...' };
  state.chat[providerKey].push(loadingMsg);
  renderChatHistory();

  const p = PROVIDERS[providerKey];
  const url = `${state.vpsUrl}${p.pathPrefix}/v1/chat/completions`;
  const body = {
    model,
    messages: [
      ...state.chat[providerKey]
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }))
    ],
  };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    // Remove loading
    state.chat[providerKey].pop();

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      state.chat[providerKey].push({
        role: 'error',
        content: `HTTP ${resp.status} ${resp.statusText}\n${text.slice(0, 400)}`,
      });
      saveState();
      renderChatHistory();
      return;
    }

    const data = await resp.json().catch(() => null);
    const reply = data?.choices?.[0]?.message?.content || '(no response)';
    state.chat[providerKey].push({ role: 'assistant', content: reply });
    saveState();
    renderChatHistory();
    toast(`✓ ${p.name} merespon`, 'success');
  } catch (err) {
    state.chat[providerKey].pop();
    const msg = err.name === 'TimeoutError' ? 'timeout (30s)' : (err.message || 'gagal');
    state.chat[providerKey].push({
      role: 'error',
      content: `Request gagal: ${msg}\n\nKemungkinan:\n- VPS belum jalan\n- CORS belum diaktifkan di Caddyfile\n- Token ${p.name} expired\n- Network/firewall block`,
    });
    saveState();
    renderChatHistory();
  }
}

/* ============================================================
 * 12. ACTIONS: REFRESH MODELS
 * ============================================================ */
async function refreshModels() {
  const providerKey = $('#chatProvider').value;
  const p = PROVIDERS[providerKey];
  if (!state.vpsUrl || !state.providers[providerKey]?.token) {
    toast('Isi VPS URL + token ' + p.name + ' dulu', 'warn');
    return;
  }
  const url = `${state.vpsUrl}${p.pathPrefix}/v1/models`;
  toast('Fetch model list...', 'info');
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) {
      toast('HTTP ' + resp.status, 'error');
      return;
    }
    const data = await resp.json();
    const models = (data?.data || []).map(m => m.id).filter(Boolean);
    if (models.length > 0) {
      p.models = models;
      renderChatModelOptions();
      toast(`✓ ${models.length} model ditemukan`, 'success');
    } else {
      toast('Tidak ada model di response', 'warn');
    }
  } catch (err) {
    toast('Gagal: ' + (err.message || 'unknown'), 'error');
  }
}

/* ============================================================
 * 13. DEPLOY PACKAGE GENERATORS
 * ============================================================ */
function genDockerCompose() {
  return `services:
  kimi-api:
    image: vinlic/kimi-free-api:latest
    container_name: kimi-api
    restart: unless-stopped
    environment:
      KIMI_REFRESH_TOKEN: \${KIMI_REFRESH_TOKEN:-}
      SERVER_PORT: 8000
    expose: ["8000"]
    networks: [router-net]

  deepseek-api:
    image: vinlic/deepseek-free-api:latest
    container_name: deepseek-api
    restart: unless-stopped
    environment:
      DEEPSEEK_COOKIE: \${DEEPSEEK_COOKIE:-}
      SERVER_PORT: 8000
    expose: ["8000"]
    networks: [router-net]

  glm-api:
    image: vinlic/glm-free-api:latest
    container_name: glm-api
    restart: unless-stopped
    environment:
      GLM_COOKIE: \${GLM_COOKIE:-}
      SERVER_PORT: 8000
    expose: ["8000"]
    networks: [router-net]

  qwen-api:
    image: vinlic/qwen-free-api:latest
    container_name: qwen-api
    restart: unless-stopped
    environment:
      QWEN_COOKIE: \${QWEN_COOKIE:-}
      SERVER_PORT: 8000
    expose: ["8000"]
    networks: [router-net]

  caddy:
    image: caddy:2-alpine
    container_name: caddy-router
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    environment:
      DOMAIN: \${DOMAIN:-}
    depends_on: [kimi-api, deepseek-api, glm-api, qwen-api]
    networks: [router-net]

volumes:
  caddy_data:
  caddy_config:

networks:
  router-net:
    driver: bridge
`;
}

function genEnvFile() {
  const lines = [
    '# Auto-generated by Gateway-LLM web UI',
    '# ⚠️ JANGAN COMMIT KE GIT. JANGAN SHARE.',
    '',
    `KIMI_REFRESH_TOKEN=${state.providers.kimi.token || ''}`,
    `DEEPSEEK_COOKIE=${state.providers.deepseek.token || ''}`,
    `GLM_COOKIE=${state.providers.glm.token || ''}`,
    `QWEN_COOKIE=${state.providers.qwen.token || ''}`,
    `DOMAIN=${state.deployConfig.domain || ''}`,
    `VPS_IP=${state.deployConfig.vpsIp || ''}`,
    '',
  ];
  return lines.join('\n');
}

function genCaddyfile() {
  // Caddy supports backtick-quoted strings — JSON body needs no escaping
  const statusBody = '{"status":"ok","providers":["kimi","deepseek","glm","qwen"],"endpoints":["/kimi/v1/chat/completions","/deepseek/v1/chat/completions","/glm/v1/chat/completions","/qwen/v1/chat/completions"]}';

  return [
    '{$DOMAIN} {',
    '\tencode zstd gzip',
    '',
    '\theader {',
    '\t\tAccess-Control-Allow-Origin "*"',
    '\t\tAccess-Control-Allow-Methods "GET, POST, OPTIONS"',
    '\t\tAccess-Control-Allow-Headers "Content-Type, Authorization"',
    '\t\tStrict-Transport-Security "max-age=31536000"',
    '\t}',
    '',
    '\t@app_preflight method OPTIONS',
    '\trespond @app_preflight 204',
    '',
    '\t@root path /',
    `\trespond @root \`${statusBody}\` 200`,
    '',
    '\thandle_path /kimi/* {',
    '\t\treverse_proxy kimi-api:8000',
    '\t}',
    '\thandle_path /deepseek/* {',
    '\t\treverse_proxy deepseek-api:8000',
    '\t}',
    '\thandle_path /glm/* {',
    '\t\treverse_proxy glm-api:8000',
    '\t}',
    '\thandle_path /qwen/* {',
    '\t\treverse_proxy qwen-api:8000',
    '\t}',
    '',
    '\trespond "Not Found" 404',
    '',
    '\tlog {',
    '\t\toutput file /data/access.log',
    '\t\tformat json',
    '\t}',
    '}',
    '',
    ':80 {',
    '\tencode zstd gzip',
    '',
    '\theader {',
    '\t\tAccess-Control-Allow-Origin "*"',
    '\t\tAccess-Control-Allow-Methods "GET, POST, OPTIONS"',
    '\t\tAccess-Control-Allow-Headers "Content-Type, Authorization"',
    '\t}',
    '',
    '\t@app_preflight method OPTIONS',
    '\trespond @app_preflight 204',
    '',
    '\t@root path /',
    `\trespond @root \`${statusBody}\` 200`,
    '',
    '\thandle_path /kimi/* {',
    '\t\treverse_proxy kimi-api:8000',
    '\t}',
    '\thandle_path /deepseek/* {',
    '\t\treverse_proxy deepseek-api:8000',
    '\t}',
    '\thandle_path /glm/* {',
    '\t\treverse_proxy glm-api:8000',
    '\t}',
    '\thandle_path /qwen/* {',
    '\t\treverse_proxy qwen-api:8000',
    '\t}',
    '',
    '\trespond "Not Found" 404',
    '',
    '\tlog {',
    '\t\toutput file /data/access.log',
    '\t\tformat json',
    '\t}',
    '}',
    '',
  ].join('\n');
}

function genDeploySh() {
  return `#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Starting Gateway-LLM router deploy..."

if [[ ! -f .env ]]; then
  echo "❌ .env not found"; exit 1
fi

if ! command -v docker &> /dev/null; then
  echo "📦 Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

if command -v ufw &> /dev/null; then
  ufw allow 22/tcp 2>/dev/null || true
  ufw allow 80/tcp 2>/dev/null || true
  ufw allow 443/tcp 2>/dev/null || true
fi

echo "🔄 Pulling images..."
docker compose pull

echo "🚀 Starting services..."
docker compose up -d

echo ""
echo "✓ Deploy complete!"
echo "  Test: curl http://localhost/"
echo "  Logs: docker compose logs -f"
`;
}

function genReadme() {
  return [
    '# Gateway-LLM Router',
    '',
    'Auto-generated by Gateway-LLM web UI.',
    '',
    '## Deploy',
    '',
    '```bash',
    '# 1. Upload semua file ini ke VPS (sudah dilakukan)',
    '# 2. SSH ke VPS, lalu:',
    'cd /opt/gateway-llm',
    'sudo bash deploy.sh',
    '```',
    '',
    '## Files',
    '- docker-compose.yml — 4 backends + Caddy',
    '- .env — token/cookie (JANGAN COMMIT)',
    '- Caddyfile — reverse proxy + auto HTTPS',
    '- deploy.sh — installer',
    '',
    '## Endpoints',
    '- POST /kimi/v1/chat/completions',
    '- POST /deepseek/v1/chat/completions',
    '- POST /glm/v1/chat/completions',
    '- POST /qwen/v1/chat/completions',
    '- GET  /   (status JSON)',
    '',
  ].join('\n');
}

/* ============================================================
 * 14. EVENT BINDING
 * ============================================================ */
function bindEvents() {
  // VPS URL
  const vpsInput = $('#vpsUrl');
  vpsInput.value = state.vpsUrl || '';
  $('#saveVpsBtn').addEventListener('click', () => {
    state.vpsUrl = normalizeVpsUrl(vpsInput.value);
    saveState();
    vpsInput.value = state.vpsUrl;
    renderVpsStatus();
    renderEndpoints();
    renderSnippet();
    toast('VPS URL disimpan', 'success');
  });
  $('#testVpsBtn').addEventListener('click', testVpsConnection);

  // Enter key on VPS input saves
  vpsInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#saveVpsBtn').click();
  });

  // Snippet controls
  $('#snippetLang').addEventListener('change', renderSnippet);
  $('#snippetProvider').addEventListener('change', renderSnippet);

  // Copy snippet
  $('#copySnippetBtn').addEventListener('click', async () => {
    try {
      await copyToClipboard($('#snippetOutput').textContent);
      toast('Code snippet disalin', 'success');
    } catch (e) {
      toast('Gagal copy: ' + e.message, 'error');
    }
  });

  // Chat controls
  $('#chatProvider').addEventListener('change', () => {
    renderChatModelOptions();
    renderChatHistory();
  });
  $('#refreshModelsBtn').addEventListener('click', refreshModels);
  $('#sendChatBtn').addEventListener('click', sendChat);
  $('#clearChatBtn').addEventListener('click', () => {
    const providerKey = $('#chatProvider').value;
    if (!confirm(`Hapus riwayat chat ${PROVIDERS[providerKey].name}?`)) return;
    state.chat[providerKey] = [];
    saveState();
    renderChatHistory();
  });
  // Ctrl+Enter to send chat
  $('#chatInput').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      sendChat();
    }
  });

  // Deploy config inputs
  $('#deployDomain').value = state.deployConfig.domain || '';
  $('#deployIp').value = state.deployConfig.vpsIp || '';
  $('#deployDomain').addEventListener('input', () => {
    state.deployConfig.domain = $('#deployDomain').value.trim();
    saveState();
  });
  $('#deployIp').addEventListener('input', () => {
    state.deployConfig.vpsIp = $('#deployIp').value.trim();
    saveState();
  });

  // Download buttons
  $('#dlCompose').addEventListener('click', () => downloadFile('docker-compose.yml', genDockerCompose(), 'text/yaml'));
  $('#dlEnv').addEventListener('click', () => downloadFile('.env', genEnvFile()));
  $('#dlCaddy').addEventListener('click', () => downloadFile('Caddyfile', genCaddyfile()));
  $('#dlDeploy').addEventListener('click', () => downloadFile('deploy.sh', genDeploySh()));
  $('#dlReadme').addEventListener('click', () => downloadFile('README.md', genReadme(), 'text/markdown'));

  $('#dlAll').addEventListener('click', async () => {
    const files = [
      ['docker-compose.yml', genDockerCompose()],
      ['.env', genEnvFile()],
      ['Caddyfile', genCaddyfile()],
      ['deploy.sh', genDeploySh()],
      ['README.md', genReadme()],
    ];
    for (const [name, content] of files) {
      downloadFile(name, content);
      await new Promise(r => setTimeout(r, 350));
    }
    toast('Semua file di-download', 'success');
  });
}

/* ============================================================
 * 15. INIT
 * ============================================================ */
function init() {
  renderVpsStatus();
  renderProviderCards();
  renderEndpoints();
  renderSnippet();
  renderChatModelOptions();
  renderChatHistory();
  bindEvents();
}

document.addEventListener('DOMContentLoaded', init);
