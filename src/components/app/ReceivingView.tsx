'use client';

import { useMemo, useState } from 'react';
import { fmtDayTime, type TwinResult } from '@/lib/twin/sim';
import { fmt, liveAt, truckStatus } from '@/lib/twin/derive';
import { LineChart } from './charts';
import { StageTable } from './StageTable';
import { Kpi, Panel, Status } from './ui';

export default function ReceivingView({ result, time }: { result: TwinResult; time: number }) {
  const live = useMemo(() => liveAt(result, time), [result, time]);
  const [all, setAll] = useState(false);
  const m = result.metrics;
  const rows = useMemo(() => {
    let i = result.trucks.findIndex((t) => t.arrive > time);
    if (i < 0) i = result.trucks.length;
    const upcoming = result.trucks.slice(i, i + 2).reverse();
    const recent = result.trucks.slice(Math.max(0, i - 40), i).reverse();
    return [...upcoming, ...recent];
  }, [result, time]);
  const shown = all ? rows : rows.slice(0, 10);

  return (
    <div className="stack">
      <div className="kpi-row">
        <Kpi label="В очереди" value={String(live.waiting)} />
        <Kpi label="Посты заняты" value={`${live.baysBusy} / ${result.params.posts}`} />
        <Kpi label="Отгружено" value={fmt.t(live.shippedT)} unit="т" />
        <Kpi label="Ожидание налива" value={fmt.min(m.avgWait)} unit="мин" />
      </div>

      <Panel title="Этапы" flush>
        <StageTable result={result} ids={['E1', 'E2', 'E3', 'E4']} />
      </Panel>

      <div className="grid-2">
        <Panel title="Автоцистерны" flush action={rows.length > 10 && <button className="link" onClick={() => setAll(!all)}>{all ? 'Свернуть' : 'Ещё'}</button>}>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Номер</th><th>Марка</th><th>Статус</th><th className="r hide-sm">Прибытие</th><th className="r">Ждала</th></tr></thead>
              <tbody>
                {shown.map((t) => {
                  const s = truckStatus(t, time);
                  const w = time >= t.gateEnd ? Math.round((Number.isFinite(t.bayStart) && time >= t.bayStart ? t.bayStart : time) - t.gateEnd) : null;
                  return (
                    <tr key={t.id} className={s.tone === 'idle' ? 'dim' : ''}>
                      <td className="mono">{t.plate}</td>
                      <td><span className={`comp c-${t.component}`}>{t.component === 0 ? '92' : '95'}</span></td>
                      <td><Status tone={s.tone}>{s.label}</Status></td>
                      <td className="r num muted hide-sm">{fmtDayTime(t.arrive)}</td>
                      <td className="r num">{w == null ? '—' : `${w} мин`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Очередь за месяц">
          <LineChart end={result.horizon} time={time} height={220} series={[{ name: 'машин в очереди', color: '#2563eb', area: true, points: result.queueSeries.map((q) => ({ t: q.t, v: q.waitingBay })) }]} />
        </Panel>
      </div>
    </div>
  );
}
