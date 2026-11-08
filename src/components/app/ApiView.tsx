'use client';

import { useState } from 'react';
import { Copy, Gauge, Lock, Play, ShieldCheck } from 'lucide-react';
import { API_ENDPOINTS } from '@/lib/api-spec';

export default function ApiView() {
  const [out, setOut] = useState<Record<string, string>>({});
  const tryIt = async (path: string) => {
    const t0 = performance.now();
    try {
      const r = await fetch(path);
      const j = await r.json();
      const ms = Math.round(performance.now() - t0);
      const pretty = JSON.stringify(j, (k, v) => (k === 'queueSeries' || k === 'endpoints' ? `[…${(v as unknown[]).length} элементов]` : v), 2);
      setOut((o) => ({ ...o, [path]: `HTTP ${r.status} · ${ms} мс\n${pretty.slice(0, 2400)}` }));
    } catch (e) {
      setOut((o) => ({ ...o, [path]: `Ошибка: ${String(e)}` }));
    }
  };

  return (
    <div className="api">
      <section className="card api-hero">
        <div>
          <span className="poi-kicker">REST · JSON · v1</span>
          <h2>API продукта</h2>
          <p>Те же расчёты, что в интерфейсе, доступны внешним системам: порталу поставщиков сырья, BI-отчётам, мобильному приложению водителя. Интеграции с ERP/MES/1С не требуются.</p>
        </div>
        <ul className="api-facts">
          <li><ShieldCheck size={18} /><div><b>Только HTTPS</b><span>HTTP → 308 на HTTPS, HSTS 2 года</span></div></li>
          <li><Lock size={18} /><div><b>Сессия или Bearer</b><span>Подписанный токен, роли на каждом методе</span></div></li>
          <li><Gauge size={18} /><div><b>240 запросов/мин на IP</b><span>Пресеты кэшируются CDN — пиковая нагрузка не бьёт по ядру</span></div></li>
        </ul>
      </section>
      <section className="card">
        <ul className="endpoints">
          {API_ENDPOINTS.map((e) => {
            const key = `${e.method} ${e.path}`;
            const runnable = e.method === 'GET' && !e.path.includes('…') && !e.path.includes('users');
            const runPath = e.path.split('&q=')[0];
            return (
              <li key={key}>
                <div className="ep-head">
                  <span className={`method m-${e.method.toLowerCase()}`}>{e.method}</span>
                  <code>{e.path}</code>
                  <span className="chip chip-gray">{e.access}</span>
                  {runnable && <button className="btn btn-soft btn-sm" onClick={() => tryIt(runPath)}><Play size={13} /> Выполнить</button>}
                </div>
                <p>{e.summary}</p>
                {e.example && (
                  <div className="code">
                    <pre>{e.example}</pre>
                    <button className="icon-btn" onClick={() => navigator.clipboard?.writeText(e.example!)} aria-label="Копировать пример"><Copy size={14} /></button>
                  </div>
                )}
                {out[runPath] && runnable && <pre className="resp">{out[runPath]}</pre>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
