'use client';

import { useMemo } from 'react';
import { fmtClock, RECIPES, type TwinResult } from '@/lib/twin/sim';
import { batchStatus, fmt, liveAt } from '@/lib/twin/derive';
import { LineChart } from './charts';
import { StageTable } from './StageTable';
import { Kpi, Panel, Status } from './ui';

export default function ProductionView({ result, time }: { result: TwinResult; time: number }) {
  const live = useMemo(() => liveAt(result, time), [result, time]);
  const p = result.params;
  const lv = result.levelSeries;

  return (
    <div className="stack">
      <div className="kpi-row">
        <Kpi label="Партий готово" value={`${live.batchesDone} / ${p.batches}`} />
        <Kpi label="Бочек" value={fmt.int(live.packed)} />
        <Kpi label="Резервуары A / B" value={`${fmt.pct(live.levelA)} / ${fmt.pct(live.levelB)}`} unit="%" />
        <Kpi label="Смесители" value={`${Math.min(live.blending + live.qc, p.blenders)} / ${p.blenders}`} />
      </div>

      <div className="grid-2">
        <Panel title="Партии" flush>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>№</th><th>Продукт</th><th>Статус</th><th className="r">План</th><th className="r">Готово</th></tr></thead>
              <tbody>
                {result.batches.map((b) => {
                  const s = batchStatus(b, time);
                  return (
                    <tr key={b.id} className={s.tone === 'idle' ? 'dim' : ''}>
                      <td className="num muted">{b.id}</td>
                      <td><b>{RECIPES[b.product]}</b> <span className="muted">· {b.m3} м³</span></td>
                      <td><Status tone={s.tone}>{s.label}</Status></td>
                      <td className="r num muted">{fmtClock(b.planned)}</td>
                      <td className="r num">{time >= b.done ? fmtClock(b.done) : Number.isFinite(b.done) && b.done > p.shiftHours * 60 + 15 ? 'после смены' : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Резервуары">
          <LineChart
            end={result.horizon}
            max={1}
            unit="%"
            time={time}
            height={200}
            series={[
              { name: 'A', color: '#2563eb', points: lv.map((x) => ({ t: x.t, v: x.a })) },
              { name: 'B', color: '#0d9488', points: lv.map((x) => ({ t: x.t, v: x.b })) }
            ]}
          />
        </Panel>
      </div>

      <Panel title="Этапы" flush>
        <StageTable result={result} ids={['I1', 'I2', 'I3', 'I4', 'I5']} />
      </Panel>
    </div>
  );
}
