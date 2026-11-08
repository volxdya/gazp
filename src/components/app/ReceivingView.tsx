'use client';

import { useMemo, useState } from 'react';
import { fmtClock, type TwinResult } from '@/lib/twin/sim';
import { fmt, liveAt, truckStatus } from '@/lib/twin/derive';
import { Gantt } from './charts';
import { StageTable } from './StageTable';
import { Kpi, Panel, Status } from './ui';

export default function ReceivingView({ result, time }: { result: TwinResult; time: number }) {
  const live = useMemo(() => liveAt(result, time), [result, time]);
  const [all, setAll] = useState(false);
  const arrived = result.trucks.filter((t) => t.arrive <= time).reverse();
  const upcoming = result.trucks.filter((t) => t.arrive > time).slice(0, 2);
  const rows = [...upcoming.reverse(), ...arrived];
  const shown = all ? rows : rows.slice(0, 9);
  const m = result.metrics;

  return (
    <div className="stack">
      <div className="kpi-row">
        <Kpi label="В очереди" value={String(live.waiting)} />
        <Kpi label="Посты слива" value={`${live.baysBusy} / ${result.params.bays}`} />
        <Kpi label="Принято" value={fmt.int(live.received)} unit="м³" />
        <Kpi label="Оборот" value={fmt.min(m.avgTurnaround)} unit="мин" />
      </div>

      <Panel title="Этапы" flush>
        <StageTable result={result} ids={['E1', 'E2', 'E3', 'E4', 'E5', 'E6']} />
      </Panel>

      <div className="grid-2">
        <Panel title="Автоцистерны" flush action={rows.length > 9 && <button className="link" onClick={() => setAll(!all)}>{all ? 'Свернуть' : `Все ${rows.length}`}</button>}>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Номер</th><th>Сырьё</th><th>Статус</th><th className="r hide-sm">Время</th><th className="r">На базе</th></tr></thead>
              <tbody>
                {shown.map((t) => {
                  const s = truckStatus(t, time);
                  const onBase = time >= t.arrive ? Math.round((Math.min(time, Number.isFinite(t.exit) ? t.exit : time)) - t.arrive) : null;
                  return (
                    <tr key={t.id} className={s.tone === 'idle' ? 'dim' : ''}>
                      <td className="mono">{t.plate}</td>
                      <td><span className={`comp c-${t.component}`}>{t.component === 0 ? 'A' : 'B'}</span> <span className="hide-sm">{t.volume} м³</span></td>
                      <td><Status tone={s.tone}>{s.label}</Status></td>
                      <td className="r num muted hide-sm">{fmtClock(t.arrive)}</td>
                      <td className="r num">{onBase == null ? '—' : `${onBase} мин`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Путь цистерн">
          <Gantt result={result} time={time} limit={10} />
        </Panel>
      </div>
    </div>
  );
}
