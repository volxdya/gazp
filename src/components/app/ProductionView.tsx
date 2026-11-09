'use client';

import { useMemo } from 'react';
import { GRADES, type TwinResult } from '@/lib/twin/sim';
import { fmt, liveAt, tankLabel, tanksAt, tankTone } from '@/lib/twin/derive';
import { LineChart } from './charts';
import { StageTable } from './StageTable';
import { Kpi, Meter, Panel, Status } from './ui';

export default function ProductionView({ result, time }: { result: TwinResult; time: number }) {
  const live = useMemo(() => liveAt(result, time), [result, time]);
  const tk = tanksAt(result, time);
  const p = result.params;
  const series = useMemo(() => [0, 1].map((g) => {
    const ids = result.tanks.filter((t) => t.grade === g).map((t) => t.id);
    return { name: GRADES[g], color: g === 0 ? '#2563eb' : '#0d9488', points: result.tankSeries.map((s) => ({ t: s.t, v: ids.reduce((a, i) => a + s.lv[i], 0) / Math.max(1, ids.length) })) };
  }), [result]);
  const ship = live.byGrade[0].ship + live.byGrade[1].ship;
  const qc = live.byGrade[0].qc + live.byGrade[1].qc;

  return (
    <div className="stack">
      <div className="kpi-row">
        <Kpi label="Парк заполнен" value={fmt.pct(live.park)} unit="%" />
        <Kpi label="На наливе" value={String(ship)} />
        <Kpi label="На анализе" value={String(qc)} />
        <Kpi label="Затаривание за месяц" value={fmt.h(result.metrics.blockedHours)} unit="ч" />
      </div>

      <div className="grid-2">
        <Panel title="Резервуары" flush>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Резервуар</th><th>Состояние</th><th>Уровень</th><th className="r">Тонн</th></tr></thead>
              <tbody>
                {result.tanks.map((t) => {
                  const st = tk.st[t.id];
                  const lv = tk.lv[t.id];
                  return (
                    <tr key={t.id}>
                      <td><span className={`comp c-${t.grade}`}>{t.grade === 0 ? '92' : '95'}</span> <b>{t.name}</b></td>
                      <td><Status tone={tankTone(st)}>{tankLabel(st)}</Status></td>
                      <td><div className="meter-cell"><Meter value={lv} tone={t.grade === 0 ? 'ext' : 'int'} /><span className="num">{fmt.pct(lv)}%</span></div></td>
                      <td className="r num">{fmt.int(lv * p.tankT)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Заполнение по маркам">
          <LineChart end={result.horizon} max={1} unit="%" time={time} height={220} series={series} />
        </Panel>
      </div>

      <Panel title="Этапы" flush>
        <StageTable result={result} ids={['I1', 'I2', 'I3', 'I4']} />
      </Panel>
    </div>
  );
}
