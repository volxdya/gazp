'use client';

import { useEffect, useMemo, useState } from 'react';
import { Award, Play, Save, Trash2 } from 'lucide-react';
import { simulate, type TwinParams, type TwinResult } from '@/lib/twin/sim';
import { SCENARIOS } from '@/lib/twin/scenarios';
import { describeParams, fmt, matchPreset } from '@/lib/twin/derive';

interface Saved { id: string; name: string; createdAt: string; params: TwinParams }

const METRICS: { key: string; label: string; unit: string; get: (r: TwinResult) => number; lower: boolean; f: (v: number) => string }[] = [
  { key: 'turn', label: 'Оборот цистерны', unit: 'мин', get: (r) => r.metrics.avgTurnaround, lower: true, f: fmt.min },
  { key: 'wait', label: 'Простой цистерны', unit: 'мин', get: (r) => r.metrics.avgWait, lower: true, f: fmt.min },
  { key: 'tank', label: 'Ждали места в резервуаре', unit: 'мин', get: (r) => r.metrics.tankFullWait, lower: true, f: fmt.int },
  { key: 'vol', label: 'Принято сырья', unit: 'м³', get: (r) => r.metrics.volume, lower: false, f: fmt.int },
  { key: 'batches', label: 'Партий за смену', unit: 'шт', get: (r) => r.metrics.batchesDone, lower: false, f: fmt.int },
  { key: 'plan', label: 'Выполнение плана', unit: '%', get: (r) => r.metrics.planDone * 100, lower: false, f: (v) => String(Math.round(v)) },
  { key: 'packed', label: 'Расфасовано', unit: 'бочек', get: (r) => r.metrics.bottledUnits, lower: false, f: fmt.int },
  { key: 'lead', label: 'Партия: от плана до склада', unit: 'мин', get: (r) => r.metrics.batchDelay, lower: true, f: fmt.min },
  { key: 'cost', label: 'Затраты за смену', unit: '₽', get: (r) => r.metrics.totalCost, lower: true, f: fmt.rub },
  { key: 'margin', label: 'Маржа смены', unit: '₽', get: (r) => r.metrics.margin, lower: false, f: fmt.rub }
];

export default function CompareView({ current, canSave, onLoad }: { current: TwinResult; canSave: boolean; onLoad: (p: TwinParams) => void }) {
  const [saved, setSaved] = useState<Saved[]>([]);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const isPreset = matchPreset(current.params);

  const cols = useMemo(() => {
    const list = SCENARIOS.map((s) => ({ id: s.id, name: s.name, sub: s.short, r: simulate(s.params) }));
    if (!isPreset) list.push({ id: 'current', name: 'Ваш сценарий', sub: describeParams(current.params), r: current });
    return list;
  }, [current, isPreset]);

  const load = () => fetch('/api/v1/scenarios').then((r) => r.json()).then((d: { saved: Saved[] }) => setSaved(d.saved ?? [])).catch(() => null);
  useEffect(() => { load(); }, []);

  const save = async () => {
    const res = await fetch('/api/v1/scenarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name || describeParams(current.params), params: current.params }) });
    setMsg(res.ok ? 'Сценарий сохранён' : 'Не удалось сохранить');
    setName('');
    load();
    setTimeout(() => setMsg(null), 2500);
  };
  const remove = async (id: string) => { await fetch(`/api/v1/scenarios?id=${id}`, { method: 'DELETE' }); load(); };

  const best = (m: (typeof METRICS)[number]) => {
    const vals = cols.map((c) => m.get(c.r));
    return m.lower ? Math.min(...vals) : Math.max(...vals);
  };
  const score = (r: TwinResult) => r.metrics.margin - r.metrics.avgTurnaround * 1000;
  const ranked = [...cols].sort((a, b) => score(b.r) - score(a.r));
  const win = ranked[0];
  const base = cols[0];

  return (
    <div className="cmp">
      <section className="card winner">
        <span className="winner-ic"><Award size={26} /></span>
        <div>
          <span className="poi-kicker">Рекомендация двойника</span>
          <h2>{win.name}</h2>
          <p>
            Оборот цистерны <b className="num">{fmt.min(win.r.metrics.avgTurnaround)} мин</b> вместо {fmt.min(base.r.metrics.avgTurnaround)},
            план выпуска <b className="num">{Math.round(win.r.metrics.planDone * 100)}%</b> вместо {Math.round(base.r.metrics.planDone * 100)}%,
            маржа смены <b className="num">{fmt.rub(win.r.metrics.margin)} ₽</b> вместо {fmt.rub(base.r.metrics.margin)} ₽.
            {win.id !== 'extra-bay' && ' Третий пост слива не нужен: цистерны ждут не поста, а места в резервуаре и лаборатории.'}
          </p>
        </div>
      </section>

      <section className="card">
        <header className="sec-head"><div><h2>Сравнение сценариев</h2><p>Одинаковый поток машин (seed {current.params.seed}) — разница только в решениях</p></div></header>
        <div className="table-wrap">
          <table className="cmp-table">
            <thead>
              <tr>
                <th scope="col">Показатель</th>
                {cols.map((c) => <th key={c.id} scope="col" className={c.id === win.id ? 'win' : ''}><b>{c.name}</b><span>{c.sub}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => {
                const bv = best(m);
                return (
                  <tr key={m.key}>
                    <th scope="row">{m.label} <small>{m.unit}</small></th>
                    {cols.map((c) => {
                      const v = m.get(c.r);
                      return <td key={c.id} className={`num ${v === bv ? 'best' : ''} ${c.id === win.id ? 'win' : ''}`}>{m.f(v)}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="cmp-charts">
        {METRICS.filter((m) => ['turn', 'plan', 'packed', 'margin'].includes(m.key)).map((m) => {
          const max = Math.max(...cols.map((c) => m.get(c.r)));
          const bv = best(m);
          return (
            <section key={m.key} className="card mini">
              <h3>{m.label} <small>{m.unit}</small></h3>
              {cols.map((c) => {
                const v = m.get(c.r);
                return (
                  <div key={c.id} className="hbar">
                    <span>{c.name}</span>
                    <div><i className={v === bv ? 'best' : ''} style={{ width: `${(v / max) * 100}%` }} /></div>
                    <b className="num">{m.f(v)}</b>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      <section className="card">
        <header className="sec-head"><div><h2>Сохранённые сценарии</h2><p>Хранятся на сервере и переживают перезапуск</p></div></header>
        {canSave ? (
          <form className="save-row" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <input className="input" placeholder={`Название, например: ${describeParams(current.params)}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            <button className="btn btn-primary" type="submit"><Save size={16} /> Сохранить текущий</button>
            {msg && <span className="chip">{msg}</span>}
          </form>
        ) : <p className="muted-p">Сохранение доступно диспетчеру и руководителю.</p>}
        <ul className="saved">
          {saved.length === 0 && <li className="muted-p">Пока пусто.</li>}
          {saved.map((s) => (
            <li key={s.id}>
              <div><b>{s.name}</b><span>{describeParams(s.params)} · {new Date(s.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
              <button className="btn btn-soft btn-sm" onClick={() => onLoad(s.params)}><Play size={14} /> Открыть</button>
              {canSave && <button className="icon-btn" onClick={() => remove(s.id)} aria-label={`Удалить ${s.name}`}><Trash2 size={16} /></button>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
