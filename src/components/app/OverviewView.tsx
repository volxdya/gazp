'use client';

import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { fmtClock, type TwinResult } from '@/lib/twin/sim';
import type { PoiId } from '@/lib/twin/pois';
import { fmt, liveAt, recentEvents } from '@/lib/twin/derive';
import SiteMap from './SiteMap';
import PoiModal from './PoiModal';
import { Kpi, Meter, Panel } from './ui';
import type { Tab } from './Workspace';

export default function OverviewView({ result, baseline, time, clock, openTour, go }: { result: TwinResult; baseline: TwinResult; time: number; clock: React.RefObject<{ t: number; speed: number }>; openTour: (id: PoiId) => void; go: (t: Tab) => void }) {
  const live = useMemo(() => liveAt(result, time), [result, time]);
  const events = useMemo(() => recentEvents(result, time, 6), [result, time]);
  const [sel, setSel] = useState<PoiId | null>(null);
  const m = result.metrics, b = baseline.metrics;
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
        <Panel title="Схема участка" className="ov-scheme" flush>
          <SiteMap result={result} time={time} selected={sel} onOpen={setSel} />
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

      {sel && <PoiModal id={sel} result={result} time={time} clock={clock} onClose={() => setSel(null)} onNav={setSel} onTour={(id) => { setSel(null); openTour(id); }} />}
    </div>
  );
}

function delta(d: number, unit: string, money = false) {
  if (Math.abs(d) < 0.5) return '±0';
  const sign = d > 0 ? '+' : '−';
  return `${sign}${money ? fmt.rub(Math.abs(d)) : fmt.min(Math.abs(d))} ${unit}`;
}
