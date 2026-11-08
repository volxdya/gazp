'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Box } from 'lucide-react';
import { fmtClock, type TwinResult } from '@/lib/twin/sim';
import { POIS, type PoiId } from '@/lib/twin/pois';
import { fmt, liveAt, pinStatuses, recentEvents } from '@/lib/twin/derive';
import { SchemeSvg } from './SchemeView';
import { Kpi, Meter, Panel } from './ui';
import type { Tab } from './Workspace';

export default function OverviewView({ result, baseline, time, openTour, go }: { result: TwinResult; baseline: TwinResult; time: number; openTour: (id: PoiId) => void; go: (t: Tab) => void }) {
  const live = useMemo(() => liveAt(result, time), [result, time]);
  const st = useMemo(() => pinStatuses(result, live), [result, live]);
  const events = useMemo(() => recentEvents(result, time, 6), [result, time]);
  const [sel, setSel] = useState<PoiId | null>(null);
  const m = result.metrics, b = baseline.metrics;
  const poi = sel ? POIS.find((x) => x.id === sel)! : null;
  const resources = [...result.resources].sort((a, c) => c.utilization - a.utilization).slice(0, 5);

  return (
    <div className="ov">
      <div className="kpi-row">
        <Kpi label="Цистерн на базе" value={String(live.onSite)} sub={live.waiting ? `${live.waiting} в очереди` : undefined} />
        <Kpi label="Оборот цистерны" value={fmt.min(m.avgTurnaround)} unit="мин" delta={delta(m.avgTurnaround - b.avgTurnaround, 'мин')} good={m.avgTurnaround <= b.avgTurnaround} />
        <Kpi label="Партий готово" value={`${live.batchesDone} / ${result.params.batches}`} />
        <Kpi label="Маржа смены" value={fmt.rub(m.margin)} unit="₽" delta={delta(m.margin - b.margin, '₽', true)} good={m.margin >= b.margin} />
      </div>

      <div className="ov-grid">
        <Panel
          title="Схема участка"
          className="ov-scheme"
          flush
          action={<div className="legend"><span><i className="ext" />приём</span><span><i className="shared" />общее</span><span><i className="int" />производство</span></div>}
        >
          <SchemeSvg result={result} time={time} selected={sel} onSelect={setSel} />
          {poi && (
            <div className="ov-poi rise" key={poi.id}>
              <div>
                <b>{poi.title}</b>
                <span className="ov-poi-status">{st[poi.id].text}</span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => openTour(poi.id)}><Box size={14} /> В 3D</button>
            </div>
          )}
        </Panel>

        <div className="ov-side">
          <Panel title="Резервуары">
            <div className="tanks">
              {[['A', live.levelA], ['B', live.levelB]].map(([n, v]) => (
                <div key={n as string} className="tank-row">
                  <span>{n as string}</span>
                  <Meter value={v as number} tone={(v as number) > 0.9 ? 'warn' : n === 'A' ? 'ext' : 'int'} />
                  <b className="num">{fmt.pct(v as number)}%</b>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Загрузка ресурсов" action={<button className="link" onClick={() => go('analytics')}><ArrowRight size={14} /></button>}>
            <div className="res-list">
              {resources.map((r) => (
                <div key={r.id} className="res-row">
                  <span>{r.label}</span>
                  <Meter value={r.utilization} tone={r.id === m.bottleneck ? 'warn' : 'ok'} />
                  <b className="num">{fmt.pct(r.utilization)}%</b>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="События">
            <ol className="feed">
              {events.length === 0 && <li className="muted">—</li>}
              {events.map((e, i) => (
                <li key={i}>
                  <time className="num">{fmtClock(e.t)}</time>
                  <i className={e.process === 'internal' ? 'int' : 'ext'} />
                  <span>{e.text}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function delta(d: number, unit: string, money = false) {
  if (Math.abs(d) < 0.5) return '±0';
  const sign = d > 0 ? '+' : '−';
  return `${sign}${money ? fmt.rub(Math.abs(d)) : fmt.min(Math.abs(d))} ${unit}`;
}
