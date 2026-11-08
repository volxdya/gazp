/** Отправка клиентских событий в журнал. Сбои отправки не должны ломать интерфейс. */
export function report(level: 'info' | 'warn' | 'error', action: string, detail: string) {
  try {
    const body = JSON.stringify({ level, action, detail });
    if (navigator.sendBeacon && level === 'error') {
      navigator.sendBeacon('/api/v1/journal', new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch('/api/v1/journal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => null);
  } catch { /* noop */ }
}
