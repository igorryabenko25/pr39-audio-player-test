'use strict';
// This is an artificial API transport, not player recovery logic.
(() => {
  const state = {
    sourceCommit: '11f37597650384b4ee06b6d59b1dfb1e2b10fb00',
    mode: 'success', generation: 0, requests: [], analytics: [], denied: [], log: [],
    enabled: false, startedAt: new Date().toISOString(),
  };
  Object.defineProperty(window, '__preview', { value: state, writable: false });
  function note(message) {
    state.log.push({ at: new Date().toISOString(), message });
    if (state.log.length > 300) state.log.shift();
    document.dispatchEvent(new Event('preview:change'));
  }
  state.note = note;
  function denied(api, target = '') {
    state.denied.push({ api, target: String(target), at: new Date().toISOString() });
    note('Заблокирована попытка: ' + api);
    return new TypeError('Network operation forbidden by static preview: ' + api);
  }
  // Never retain or fall back to native fetch.
  window.fetch = async (input, options = {}) => {
    if (!state.enabled) throw denied('fetch before safe initialization');
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input), location.href);
    const method = String(options.method || request?.method || 'GET').toUpperCase();
    const signal = options.signal || request?.signal;
    if (url.origin !== location.origin || url.search || url.hash) throw denied('fetch', url.href);
    if (method === 'POST' && url.pathname === '/api/analytics/audio') {
      // Only an in-memory test journal. No telemetry leaves the page.
      try {
        const body = options.body ?? (request ? await request.text() : '{}');
        const event = JSON.parse(String(body));
        state.analytics.push({ eventType: event.eventType, positionSeconds: event.positionSeconds });
        if (state.analytics.length > 300) state.analytics.shift();
      } catch { return new Response('{}', { status: 400 }); }
      note('Искусственная аналитика: ответ в памяти, сеть не используется');
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (method !== 'GET' || url.pathname !== '/api/audio/offline-practice') throw denied('fetch', url.href);
    const recovery = options.cache === 'no-store';
    const mode = recovery ? state.mode : 'success';
    if (recovery) { state.mode = 'success'; document.dispatchEvent(new Event('preview:mode')); }
    const generation = ++state.generation;
    const record = { generation, mode, recovery, at: new Date().toISOString(), status: 'pending' };
    state.requests.push(record);
    note((recovery ? 'Восстановление' : 'Загрузка') + ': искусственный API, режим ' + mode);
    return new Promise((resolve, reject) => {
      let timer, settled = false;
      const finish = (action) => {
        if (settled) return;
        settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
        action(); document.dispatchEvent(new Event('preview:change'));
      };
      const abort = () => finish(() => { record.status = 'aborted'; note('Запрос отменён компонентом'); reject(new DOMException('Aborted', 'AbortError')); });
      if (mode !== 'late') {
        if (signal?.aborted) { abort(); return; }
        signal?.addEventListener('abort', abort, { once: true });
      }
      if (mode === 'timeout') return; // Component's actual 15-second timer must abort this.
      timer = setTimeout(() => finish(() => {
        if (mode === 'failure') {
          record.status = '500'; note('Искусственный API вернул 500');
          resolve(new Response('{"error":"injected-offline-error"}', { status: 500, headers: { 'Content-Type': 'application/json' } }));
        } else {
          const media = new URL('./audio/resurs.mp3', new URL('.', location.href));
          media.searchParams.set('generation', String(generation));
          record.status = '200'; record.mediaPath = media.pathname + media.search;
          note('Возвращена новая локальная MP3-ссылка поколения ' + generation + (mode === 'late' ? ' (запоздавший ответ; отмена намеренно игнорировалась)' : ''));
          resolve(new Response(JSON.stringify({ url: media.href, expiresIn: 300 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
      }), mode === 'late' ? 18000 : 250);
    });
  };
  for (const name of ['WebSocket', 'EventSource', 'XMLHttpRequest', 'Worker', 'SharedWorker', 'RTCPeerConnection', 'webkitRTCPeerConnection']) {
    if (name in window) Object.defineProperty(window, name, { configurable: false, writable: false, value: class { constructor() { throw denied(name); } } });
  }
  Object.defineProperty(navigator, 'sendBeacon', { value: () => { denied('sendBeacon'); return false; }, configurable: false });
  document.addEventListener('securitypolicyviolation', event => {
    state.denied.push({ api: 'CSP', directive: event.effectiveDirective, target: event.blockedURI });
    note('CSP заблокировала ресурс: ' + event.effectiveDirective);
  });
  if (!['http:', 'https:'].includes(location.protocol)) { note('Открывайте страницу по тестовой HTTP(S)-ссылке, не как file://'); return; }
  // A fresh, dedicated site is required. Do not silently reuse a controlling worker.
  if (navigator.serviceWorker?.controller) { note('BLOCKED: страницей управляет Service Worker; используйте новый отдельный сайт'); return; }
  state.enabled = true;
  note('Статический адаптер готов. Внешние API запрещены; MP3 загружается только с адреса страницы.');
})();
