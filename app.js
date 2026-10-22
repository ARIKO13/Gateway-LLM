/* Gateway-LLM · Minimal web UI
 * Input sesi → kirim ke VPS via admin endpoint → API otomatis aktif
 */
'use strict';

// ============================================================
// CONFIG — VPS yang sudah aku deploy buat kamu
// ============================================================
const VPS_URL = 'https://176-100-37-238.sslip.io';
const ADMIN_TOKEN = 'EN5jLt735zkypxm9c7iEHlAitlcf7cZq0E7nCq35ei8';

// ============================================================
// PROVIDER METADATA
// ============================================================
const PROVIDERS = {
  kimi: {
    name: 'Kimi', vendor: 'Moonshot AI',
    placeholder: 'eyJhbGciOiJIUzI1...',
    help: 'Login kimi.com → F12 → Application → Cookies → refresh_token (JWT)',
    loginUrl: 'https://kimi.com',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'kimi-latest'],
    defaultModel: 'moonshot-v1-8k',
    pathPrefix: '/kimi',
  },
  deepseek: {
    name: 'DeepSeek', vendor: 'DeepSeek AI',
    placeholder: 'userToken=...; cf_clearance=...; ...',
    help: 'Login chat.deepseek.com → F12 → Network → reload → klik request → Cookie header',
    loginUrl: 'https://chat.deepseek.com',
    models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
    pathPrefix: '/deepseek',
  },
  glm: {
    name: 'GLM', vendor: 'Zhipu AI',
    placeholder: 'sessionID=...; token=...; ...',
    help: 'Login chatglm.cn → F12 → Network → reload → klik request → Cookie header',
    loginUrl: 'https://chatglm.cn',
    models: ['glm-4', 'glm-4-flash', 'glm-4-air', 'glm-4-longcontext'],
    defaultModel: 'glm-4',
    pathPrefix: '/glm',
  },
  qwen: {
    name: 'Qwen', vendor: 'Alibaba Tongyi',
    placeholder: 'login_aliyid_t=...; cna=...; ...',
    help: 'Login tongyi.aliyun.com → F12 → Network → reload → Cookie header',
    loginUrl: 'https://tongyi.aliyun.com',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen2-72b'],
    defaultModel: 'qwen-max',
    pathPrefix: '/qwen',
  },
};
const PROVIDER_KEYS = Object.keys(PROVIDERS);

// ============================================================
// STATE (localStorage)
// ============================================================
const STORAGE_KEY = 'gateway-llm-v2';
const defaultState = {
  tokens: { kimi: '', deepseek: '', glm: '', qwen: '' },
  chat: { kimi: [], deepseek: [], glm: [], qwen: [] },
  lastUpdate: null,
};
function loadState() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return structuredClone(defaultState);
    const p = JSON.parse(s);
    return {
      ...structuredClone(defaultState),
      ...p,
      tokens: { ...defaultState.tokens, ...(p.tokens || {}) },
      chat: { ...defaultState.chat, ...(p.chat || {}) },
    };
  } catch { return structuredClone(defaultState); }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
let state = loadState();

// ============================================================
// UTILS
// ============================================================
const $ = sel => document.querySelector(sel);
function toast(msg, type='info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = msg;
  $('#toastContainer').appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0'; el.style.transition = 'opacity 0.25s';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ============================================================
// RENDER: status pill
// ============================================================
async function renderVpsStatus() {
  const pill = $('#vpsStatus');
  const dot = pill.querySelector('.dot');
  const text = pill.querySelector('.status-text');
  dot.className = 'dot dot-gray';
  text.textContent = 'Cek status...';
  try {
    const r = await fetch(VPS_URL + '/', { signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const d = await r.json().catch(() => null);
      dot.className = 'dot dot-green';
      text.textContent = 'VPS online';
      if (d && d.providers) text.textContent = 'VPS: ' + d.providers.length + ' provider';
    } else {
      dot.className = 'dot dot-red';
      text.textContent = 'VPS HTTP ' + r.status;
    }
  } catch (e) {
    dot.className = 'dot dot-red';
    text.textContent = 'VPS unreachable';
  }
}

// ============================================================
// RENDER: provider cards
// ============================================================
function renderProviders() {
  const grid = $('#providerGrid');
  grid.innerHTML = '';
  for (const key of PROVIDER_KEYS) {
    const p = PROVIDERS[key];
    const token = state.tokens[key] || '';
    const has = Boolean(token);
    const card = document.createElement('div');
    card.className = 'provider-card' + (has ? ' has-token' : '');
    card.innerHTML = `
      <div class="provider-card-header">
        <div class="provider-card-title">
          <strong>${p.name}</strong><small>${p.vendor}</small>
        </div>
        <div class="provider-card-status">${has ? '✓ terisi' : 'kosong'}</div>
      </div>
      <input type="password" data-provider="${key}" placeholder="${escapeHtml(p.placeholder)}" value="${escapeHtml(token)}" autocomplete="off" spellcheck="false" />
      <div class="provider-help">${escapeHtml(p.help)} · <a href="${p.loginUrl}" target="_blank" rel="noopener">Login</a></div>
    `;
    grid.appendChild(card);
    // Update token on input (debounced via save)
    card.querySelector('input').addEventListener('input', e => {
      state.tokens[key] = e.target.value.trim();
      saveState();
      // Update just this card's status without full re-render
      card.classList.toggle('has-token', Boolean(state.tokens[key]));
      card.querySelector('.provider-card-status').textContent = state.tokens[key] ? '✓ terisi' : 'kosong';
      renderEndpoints();
    });
  }
}

// ============================================================
// RENDER: API endpoints
// ============================================================
function renderEndpoints() {
  const list = $('#endpointList');
  list.innerHTML = '';
  for (const key of PROVIDER_KEYS) {
    const p = PROVIDERS[key];
    const has = Boolean(state.tokens[key]);
    const item = document.createElement('div');
    item.className = 'endpoint-item' + (has ? '' : ' unconfigured');
    item.innerHTML = `
      <div class="endpoint-name">${p.name}</div>
      <div class="endpoint-url">${VPS_URL}${p.pathPrefix}/v1/chat/completions</div>
      <div class="endpoint-method">POST</div>
    `;
    list.appendChild(item);
  }
}

// ============================================================
// ACTION: Update VPS (kirim token ke admin endpoint)
// ============================================================
async function updateVps() {
  const btn = $('#updateVpsBtn');
  const hint = $('#updateHint');
  btn.disabled = true;
  btn.textContent = '⏳ Mengirim...';
  hint.textContent = 'Mengirim token ke VPS...';

  const payload = {};
  let count = 0;
  for (const key of PROVIDER_KEYS) {
    if (state.tokens[key]) {
      payload[key] = state.tokens[key];
      count++;
    }
  }

  if (count === 0) {
    toast('Isi minimal 1 token provider', 'warn');
    btn.disabled = false;
    btn.textContent = '🚀 Update VPS';
    hint.textContent = 'Tidak ada token untuk dikirim.';
    return;
  }

  try {
    const r = await fetch(VPS_URL + '/admin/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ADMIN_TOKEN,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(90000),  // 90s biar cukup buat force-recreate
    });
    const data = await r.json().catch(() => ({ error: 'invalid JSON' }));
    if (r.ok && data.status === 'ok') {
      toast(`✓ ${count} provider diupdate, container direstart`, 'success');
      hint.innerHTML = `✓ Update sukses pada <code>${new Date().toLocaleTimeString()}</code>. Providers: <strong>${(data.updated || []).join(', ')}</strong>`;
      state.lastUpdate = Date.now();
      saveState();
      // Re-check VPS status
      setTimeout(renderVpsStatus, 2000);
    } else {
      toast('Update gagal: ' + (data.error || 'HTTP ' + r.status), 'error');
      hint.textContent = '✗ ' + (data.error || 'HTTP ' + r.status);
    }
  } catch (e) {
    const msg = e.name === 'TimeoutError' ? 'timeout (90s)' : (e.message || 'gagal');
    toast('Update gagal: ' + msg, 'error');
    hint.textContent = '✗ ' + msg;
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 Update VPS';
  }
}

// ============================================================
// CHAT
// ============================================================
function renderChatModels() {
  const key = $('#chatProvider').value;
  const p = PROVIDERS[key];
  $('#chatModel').innerHTML = p.models.map(m => `<option value="${m}">${m}</option>`).join('');
}
function renderChatHistory() {
  const key = $('#chatProvider').value;
  const hist = state.chat[key] || [];
  const c = $('#chatHistory');
  if (hist.length === 0) {
    c.innerHTML = '<div class="chat-empty">Belum ada pesan.</div>';
    return;
  }
  c.innerHTML = '';
  for (const m of hist) {
    const div = document.createElement('div');
    div.className = `chat-message ${m.role}`;
    const av = m.role === 'user' ? '🧑' : m.role === 'assistant' ? '🤖' : '⚠';
    div.innerHTML = `<div class="chat-avatar">${av}</div><div class="chat-bubble">${escapeHtml(m.content)}</div>`;
    c.appendChild(div);
  }
  c.scrollTop = c.scrollHeight;
}
async function sendChat() {
  const key = $('#chatProvider').value;
  const model = $('#chatModel').value;
  const msg = $('#chatInput').value.trim();
  if (!msg) return;
  if (!state.tokens[key]) {
    toast(`Isi token ${PROVIDERS[key].name} dulu`, 'warn');
    return;
  }
  state.chat[key].push({ role: 'user', content: msg });
  saveState();
  $('#chatInput').value = '';
  renderChatHistory();

  state.chat[key].push({ role: 'loading', content: '⏳ menunggu...' });
  renderChatHistory();

  const p = PROVIDERS[key];
  const messages = state.chat[key].filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: m.content }));
  try {
    const r = await fetch(VPS_URL + p.pathPrefix + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer not-needed',  // vinlic/*-free-api wajib header ini
      },
      body: JSON.stringify({ model, messages }),
      signal: AbortSignal.timeout(30000),
    });
    state.chat[key].pop();
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      state.chat[key].push({ role: 'error', content: `HTTP ${r.status}\n${t.slice(0,400)}` });
    } else {
      const d = await r.json();
      const reply = d?.choices?.[0]?.message?.content || '(no response)';
      state.chat[key].push({ role: 'assistant', content: reply });
    }
  } catch (e) {
    state.chat[key].pop();
    const msg2 = e.name === 'TimeoutError' ? 'timeout (30s)' : (e.message || 'gagal');
    state.chat[key].push({ role: 'error', content: `Gagal: ${msg2}\n\nKemungkinan token expired atau VPS bermasalah.` });
  }
  saveState();
  renderChatHistory();
}
async function refreshModels() {
  const key = $('#chatProvider').value;
  const p = PROVIDERS[key];
  if (!state.tokens[key]) { toast(`Isi token ${p.name} dulu`, 'warn'); return; }
  toast('Fetch model list...', 'info');
  try {
    const r = await fetch(VPS_URL + p.pathPrefix + '/v1/models', {
      headers: { 'Authorization': 'Bearer not-needed' },  // vinlic wajib
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) { toast('HTTP ' + r.status, 'error'); return; }
    const d = await r.json();
    const ids = (d?.data || []).map(m => m.id).filter(Boolean);
    if (ids.length > 0) {
      p.models = ids;
      renderChatModels();
      toast(`✓ ${ids.length} model`, 'success');
    } else { toast('Tidak ada model di response', 'warn'); }
  } catch (e) { toast('Gagal: ' + (e.message || 'unknown'), 'error'); }
}

// ============================================================
// INIT + BIND
// ============================================================
function init() {
  renderVpsStatus();
  renderProviders();
  renderEndpoints();
  renderChatModels();
  renderChatHistory();
  if (state.lastUpdate) {
    $('#updateHint').innerHTML = `Update terakhir: <code>${new Date(state.lastUpdate).toLocaleString()}</code>`;
  }

  $('#updateVpsBtn').addEventListener('click', updateVps);
  $('#testChatBtn').addEventListener('click', () => {
    const sec = $('#chatSection');
    sec.hidden = !sec.hidden;
    if (!sec.hidden) sec.scrollIntoView({ behavior: 'smooth' });
  });

  $('#chatProvider').addEventListener('change', () => { renderChatModels(); renderChatHistory(); });
  $('#refreshModelsBtn').addEventListener('click', refreshModels);
  $('#sendChatBtn').addEventListener('click', sendChat);
  $('#clearChatBtn').addEventListener('click', () => {
    const k = $('#chatProvider').value;
    if (!confirm(`Hapus chat ${PROVIDERS[k].name}?`)) return;
    state.chat[k] = []; saveState(); renderChatHistory();
  });
  $('#chatInput').addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); sendChat(); }
  });
}
document.addEventListener('DOMContentLoaded', init);
