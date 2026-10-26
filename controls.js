'use strict';
(() => {
  const state = window.__preview;
  const status = document.getElementById('panel-status');
  const selector = document.getElementById('scenario');
  const player = () => document.querySelector('#root audio');
  const originalButtons = () => [...document.querySelectorAll('#root button, .practice-immersive button')];
  function message(text) { status.textContent = text; state.note(text); }
  function originalButton(text) { return originalButtons().find(button => button.textContent.trim() === text); }
  function usableAudio() {
    const audio = player();
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) throw Error('Дождитесь загрузки MP3.');
    return audio;
  }
  function hasError() { return Boolean(originalButton('Продолжить с этого места')); }
  function ensureSession() {
    if (!document.querySelector('.practice-immersive .practice-main-control')) throw Error('Сначала нажмите «Начать практику» и подождите 5 секунд.');
  }
  const actions = {
    begin() {
      if (document.querySelector('.practice-immersive')) throw Error('Практика уже открыта. Используйте кнопку воспроизведения или завершите её.');
      const button = originalButton('Начать практику');
      if (!button) throw Error('Плеер ещё не готов.');
      button.click(); message('Начало через 5 секунд. Звук запускается штатной логикой компонента.');
    },
    toggle() {
      ensureSession();
      if (hasError()) throw Error('Сейчас ошибка: используйте «Продолжить с этого места».');
      const button = document.querySelector('.practice-immersive .practice-main-control');
      button.click(); message('Нажата штатная кнопка паузы / воспроизведения.');
    },
    seek() { seekTo(usableAudio().currentTime + 15); },
    'near-end'() { seekTo(usableAudio().duration - 2); message('Почти конец. Дождитесь окончания: практика не должна засчитаться без 90% прослушивания.'); },
    break() {
      ensureSession(); const audio = usableAudio();
      const saved = audio.currentTime;
      audio.pause();
      audio.dispatchEvent(new Event('error'));
      message('Искусственное событие error, позиция ' + saved.toFixed(1) + ' с. HTTP-поток сервера НЕ обрывался.');
    },
    recover() {
      ensureSession(); const button = originalButton('Продолжить с этого места');
      if (!button || button.disabled) throw Error('Кнопка восстановления пока недоступна. Сначала вызовите ошибку или дождитесь тайм-аута.');
      button.click(); message('Нажата штатная кнопка восстановления. Новую ссылку выдаёт только искусственный API.');
    },
    waiting() { bufferEvent('waiting'); },
    stalled() { bufferEvent('stalled'); },
    download() {
      const report = {
        kind: 'manual-static-preview-observations-not-automated-PASS',
        commit: state.sourceCommit, at: new Date().toISOString(),
        syntheticFaults: true, actualNetworkStreamInterruptionTested: false,
        requests: state.requests, fakeAnalytics: state.analytics, denied: state.denied,
        progress: window.__harness?.memory.progress || [],
        mediaEvents: window.__harness?.events || [], log: state.log,
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'pr39-manual-preview-report.json';
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      message('Отчёт сформирован в браузере. Он не отправлен на сервер и не объявляет автоматический PASS.');
    },
    reset() { location.reload(); },
  };
  function seekTo(position) {
    ensureSession(); const audio = usableAudio();
    if (hasError()) throw Error('Сначала восстановите воспроизведение.');
    const range = document.querySelector('.practice-immersive input[type=range]');
    if (!range || range.disabled) throw Error('Штатная перемотка пока недоступна.');
    const next = Math.max(0, Math.min(Math.floor(position), Number(range.max)));
    // Dispatch input through React's actual range onChange, without rewriting seek logic.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(range, String(next));
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
    message('Штатная перемотка: ' + next + ' с. Проверьте положение ползунка и звук.');
  }
  function bufferEvent(name) {
    ensureSession(); const audio = usableAudio(); audio.pause();
    audio.dispatchEvent(new Event(name));
    message('Синтетическое ' + name + ': ожидайте сообщение примерно через 8 секунд.');
  }
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
    try {
      if (!state.enabled) throw Error('Инициализация безопасности не завершена. Не используйте страницу.');
      actions[button.dataset.action]();
    } catch (error) { message(error.message); }
  }));
  selector.addEventListener('change', () => { state.mode = selector.value; message('Следующее восстановление: ' + selector.selectedOptions[0].textContent); });
  document.addEventListener('preview:mode', () => { selector.value = 'success'; });
  function render() {
    const audio = player();
    document.getElementById('media-status').textContent = audio && Number.isFinite(audio.duration) ? `${audio.paused ? 'Пауза' : 'Играет'} · ${audio.currentTime.toFixed(1)} / ${audio.duration.toFixed(1)} с` : 'Ожидание метаданных MP3';
    document.getElementById('security-status').textContent = `Инициализация: ${state.enabled ? 'готова' : 'BLOCKED'} · заблокированных попыток: ${state.denied.length}`;
    document.getElementById('test-log').textContent = state.log.slice(-40).map(item => item.at.slice(11,19) + ' ' + item.message).join('\n');
  }
  document.addEventListener('preview:change', render);
  setInterval(render, 500);
  message(state.enabled ? 'Готово. Начните практику; воспроизведение требует действия пользователя.' : 'BLOCKED: безопасная инициализация не завершена.');
  render();
})();
