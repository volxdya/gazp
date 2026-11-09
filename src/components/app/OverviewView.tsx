'use client';

import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { GRADES, type TwinResult } from '@/lib/twin/sim';
import type { PoiId } from '@/lib/twin/pois';
import { fmt, liveAt } from '@/lib/twin/derive';
import SiteMap from './SiteMap';
import PoiModal from './PoiModal';
import { Kpi, Meter, Panel } from './ui';
import type { Tab } from './Workspace';

export default function OverviewView({ result, baseline, time, clock, openTour, go }: { result: TwinResult; baseline: TwinResult; time: number; clock: React.RefObject<{ t: number; speed: number }>; openTour: (id: PoiId) => void; go: (t: Tab) => void }) {
  const live = useMemo(() => liveAt(result, time), [result, time]);
  const [sel, setSel] = useState<PoiId | null>(null);
  const m = result.metrics, b = baseline.metrics;
  const dw = m.avgWait - b.avgWait;

  return (
    <div className="ov">
      <div className="kpi-row">
        <Kpi label="Машин в очереди" value={String(live.waiting)} />
        <Kpi label="Ожидание налива" value={fmt.min(m.avgWait)} unit="мин" delta={Math.abs(dw) < 0.5 ? undefined : `${dw > 0 ? '+' : '−'}${fmt.min(Math.abs(dw))} мин`} good={dw <= 0} />
        <Kpi label="Парк заполнен" value={fmt.pct(live.park)} unit="%" />
        <Kpi label="План месяца" value={(m.planDone * 100).toFixed(1).replace('.', ',')} unit="%" sub={m.blockedHours > 0.5 ? `затаривание ${fmt.h(m.blockedHours)} ч` : undefined} />
      </div>

      <Panel title="Схема участка" className="ov-scheme" flush>
        <SiteMap result={result} time={time} selected={sel} onOpen={setSel} />
      </Panel>

      <Panel title="Марки" action={<button className="link" onClick={() => go('plan')} aria-label="План"><ArrowRight size={14} /></button>}>
        <div className="res-list res-grid">
          {[0, 1].map((g) => (
            <div key={g} className="res-row">
              <span>{GRADES[g]}{live.blocked[g] && <em>затаривание</em>}</span>
              <Meter value={live.byGrade[g].level} tone={live.byGrade[g].level > 0.85 ? 'warn' : g === 0 ? 'ext' : 'int'} />
              <b className="num">{fmt.pct(live.byGrade[g].level)}%</b>
            </div>
          ))}
          <div className="res-row">
            <span>Посты налива</span>
            <Meter value={m.postUtil} tone={m.postUtil > 0.85 ? 'warn' : 'ok'} />
            <b className="num">{fmt.pct(m.postUtil)}%</b>
          </div>
        </div>
      </Panel>

      {sel && <PoiModal id={sel} result={result} time={time} clock={clock} onClose={() => setSel(null)} onNav={setSel} onTour={(id) => { setSel(null); openTour(id); }} />}
    </div>
  );
}
