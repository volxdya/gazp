'use client';

import { useEffect, useMemo, useState } from 'react';
import { Lock, Save, Trash2 } from 'lucide-react';
import { simulate, type TwinParams, type TwinResult } from '@/lib/twin/sim';
import { SCENARIOS } from '@/lib/twin/scenarios';
import { compareRows, describeParams, fmt, insight, matchPreset, rowTone } from '@/lib/twin/derive';
import { Stepper, Switch } from '@/components/ui/Stepper';
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

export default function AnalyticsView({ result, baseline, baselineId, setBaselineId, apply, busy, canRun, time }: Props) {
  const runs = useMemo(() => SCENARIOS.map((s) => ({ s, r: simulate(s.params) })), []);
  const current = matchPreset(result.params);
  const rows = useMemo(() => compareRows(baseline, result), [baseline, result]);
  const ins = useMemo(() => insight(baseline, result), [baseline, result]);
  const [draft, setDraft] = useState<TwinParams>(result.params);
  useEffect(() => setDraft(result.params), [result.params]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(result.params);

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

  const best = runs.reduce((a, b) => (b.r.metrics.margin - b.r.metrics.avgTurnaround * 1000 > a.r.metrics.margin - a.r.metrics.avgTurnaround * 1000 ? b : a));

  return (
    <div className="stack">
      <div className="scen-row" role="list" aria-label="Сценарии">
        {runs.map(({ s, r }) => (
          <button key={s.id} role="listitem" className={`scen ${current?.id === s.id ? 'on' : ''}`} onClick={() => apply(s.params)} disabled={busy}>
            {s.id === best.s.id && <span className="scen-k"><em>лучший</em></span>}
            <b>{s.name}</b>
            <dl>
              <div><dt>Оборот</dt><dd className="num">{fmt.int(r.metrics.avgTurnaround)} мин</dd></div>
              <div><dt>План</dt><dd className="num">{Math.round(r.metrics.planDone * 100)}%</dd></div>
              <div><dt>Маржа</dt><dd className="num">{fmt.rub(r.metrics.margin)}</dd></div>
            </dl>
          </button>
        ))}
      </div>

      <div className="grid-2">
        <Panel
          title="Было → стало"
          flush
          action={
            <select className="select-sm" value={baselineId} onChange={(e) => setBaselineId(e.target.value)} aria-label="Сравнить с">
              {SCENARIOS.map((s) => <option key={s.id} value={s.id}>сравнить с: {s.name}</option>)}
            </select>
          }
        >
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

        <Panel title="Свой сценарий">
          {canRun ? (
            <div className="form">
              <Row label="Постов слива"><Stepper label="Постов слива" value={draft.bays} min={1} max={6} onChange={(v) => setDraft({ ...draft, bays: v })} /></Row>
              <Row label="Цистерн в час"><Stepper label="Цистерн в час" value={draft.trucksPerHour} min={0.5} max={4} step={0.25} onChange={(v) => setDraft({ ...draft, trucksPerHour: v })} format={(v) => String(v).replace('.', ',')} /></Row>
              <Row label="Смесителей"><Stepper label="Смесителей" value={draft.blenders} min={1} max={3} onChange={(v) => setDraft({ ...draft, blenders: v })} /></Row>
              <Row label="Партий по плану"><Stepper label="Партий по плану" value={draft.batches} min={2} max={14} onChange={(v) => setDraft({ ...draft, batches: v })} /></Row>
              <Row label="Линий фасовки"><Stepper label="Линий фасовки" value={draft.lines} min={1} max={2} onChange={(v) => setDraft({ ...draft, lines: v })} /></Row>
              <Row label="Цифровой приём">
                <Switch label="Цифровой приём" checked={draft.automation && draft.prepMode === 'prebooked'} onChange={(v) => setDraft({ ...draft, automation: v, prepMode: v ? 'prebooked' : 'on-arrival' })} />
              </Row>
              <button className="btn btn-primary btn-block" onClick={() => apply(draft)} disabled={busy || !dirty}>{busy ? 'Считаем…' : 'Рассчитать'}</button>
            </div>
          ) : (
            <p className="muted locked"><Lock size={14} /> Только для диспетчера и руководителя</p>
          )}
        </Panel>
      </div>

      <div className="grid-2">
        <Panel title="Цистерны на базе">
          <LineChart
            end={Math.max(result.horizon, baseline.horizon)}
            time={time}
            series={[
              { name: 'Было', color: '#94a3b8', dashed: true, points: baseline.queueSeries.map((q) => ({ t: q.t, v: q.onSite })) },
              { name: 'Стало', color: '#2563eb', area: true, points: result.queueSeries.map((q) => ({ t: q.t, v: q.onSite })) }
            ]}
          />
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
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="form-row">
      <span>{label}{hint && <small>{hint}</small>}</span>
      {children}
    </div>
  );
}
