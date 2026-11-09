'use client';

import { useEffect, useMemo, useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { simulate, type TwinParams, type TwinResult } from '@/lib/twin/sim';
import { SCENARIOS } from '@/lib/twin/scenarios';
import { compareRows, describeParams, fmt, insight, matchPreset, rowTone } from '@/lib/twin/derive';
import { LineChart } from './charts';
import { Panel } from './ui';

interface Saved { id: string; name: string; createdAt: string; params: TwinParams }

interface Props {
  result: TwinResult;
  baseline: TwinResult;
  baselineId: string;
  setBaselineId: (id: string) => void;
  apply: (p: TwinParams) => void;
  busy: boolean;
  canRun: boolean;
  time: number;
}

const parkSeries = (r: TwinResult) => r.tankSeries.map((s) => ({ t: s.t, v: s.lv.reduce((a, b) => a + b, 0) / Math.max(1, s.lv.length) }));

export default function AnalyticsView({ result, baseline, baselineId, setBaselineId, apply, busy, canRun, time }: Props) {
  const runs = useMemo(() => SCENARIOS.map((s) => ({ s, r: simulate(s.params) })), []);
  const current = matchPreset(result.params);
  const rows = useMemo(() => compareRows(baseline, result), [baseline, result]);
  const ins = useMemo(() => insight(baseline, result), [baseline, result]);
  const best = runs.reduce((a, b) => (b.r.metrics.avgWait + b.r.metrics.blockedHours * 10 < a.r.metrics.avgWait + a.r.metrics.blockedHours * 10 ? b : a));

  const [saved, setSaved] = useState<Saved[]>([]);
  const [name, setName] = useState('');
  const load = () => fetch('/api/v1/scenarios').then((r) => r.json()).then((d: { saved: Saved[] }) => setSaved(d.saved ?? [])).catch(() => null);
  useEffect(() => { if (canRun) load(); }, [canRun]);
  const save = async () => {
    await fetch('/api/v1/scenarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name || describeParams(result.params), params: result.params }) });
    setName('');
    load();
  };
  const remove = async (id: string) => { await fetch(`/api/v1/scenarios?id=${id}`, { method: 'DELETE' }); load(); };

  return (
    <div className="stack">
      <div className="scen-row" role="list" aria-label="Сценарии">
        {runs.map(({ s, r }) => (
          <button key={s.id} role="listitem" className={`scen ${current?.id === s.id ? 'on' : ''}`} onClick={() => apply(s.params)} disabled={busy}>
            {s.id === best.s.id && <span className="scen-k"><em>лучший</em></span>}
            <b>{s.name}</b>
            <dl>
              <div><dt>Ожидание</dt><dd className="num">{fmt.min(r.metrics.avgWait)} мин</dd></div>
              <div><dt>Очередь</dt><dd className="num">до {r.metrics.maxQueue}</dd></div>
              <div><dt>Затаривание</dt><dd className="num">{fmt.h(r.metrics.blockedHours)} ч</dd></div>
            </dl>
          </button>
        ))}
      </div>

      <div className="grid-2">
        <Panel title="Было → стало" flush action={
          <select className="select-sm" value={baselineId} onChange={(e) => setBaselineId(e.target.value)} aria-label="Сравнить с">
            {SCENARIOS.map((s) => <option key={s.id} value={s.id}>сравнить с: {s.name}</option>)}
          </select>
        }>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Показатель</th><th className="r">Было</th><th className="r">Стало</th><th className="r hide-sm">Изменение</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const tone = rowTone(r);
                  const d = r.b - r.a;
                  return (
                    <tr key={r.key}>
                      <td>{r.label}</td>
                      <td className="r num muted">{r.format(r.a)} {r.unit}</td>
                      <td className="r num"><b>{r.format(r.b)}</b> {r.unit}</td>
                      <td className={`r num hide-sm ${tone === 'good' ? 'up' : tone === 'bad' ? 'down' : 'muted'}`}>{tone === 'same' ? '—' : `${d > 0 ? '+' : '−'}${r.format(Math.abs(d))}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={`verdict v-${ins.tone}`}><b>{ins.title}</b></div>
        </Panel>

        <div className="stack">
          <Panel title="Парк заполнен">
            <LineChart end={result.horizon} max={1} unit="%" time={time} series={[
              { name: 'было', color: '#94a3b8', dashed: true, points: parkSeries(baseline) },
              { name: 'стало', color: '#2563eb', area: true, points: parkSeries(result) }
            ]} />
          </Panel>
          <Panel title="Сохранённые">
            {canRun && (
              <form className="save" onSubmit={(e) => { e.preventDefault(); save(); }}>
                <input className="input" placeholder={describeParams(result.params)} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Название сценария" />
                <button className="btn btn-ghost" type="submit"><Save size={15} /> Сохранить</button>
              </form>
            )}
            <ul className="saved">
              {saved.length === 0 && <li className="muted">—</li>}
              {saved.map((s) => (
                <li key={s.id}>
                  <button className="saved-main" onClick={() => apply({ ...result.params, ...s.params })}><b>{s.name}</b><span>{describeParams({ ...result.params, ...s.params })}</span></button>
                  <button className="icon-btn" onClick={() => remove(s.id)} aria-label={`Удалить ${s.name}`}><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
