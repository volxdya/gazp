'use client';

import { RESOURCE_LABEL, type TwinResult } from '@/lib/twin/sim';
import { STAGES, type StageId } from '@/lib/twin/pois';
import { fmt, stageStats } from '@/lib/twin/derive';
import { Meter } from './ui';

const dur = (min: number) => (!Number.isFinite(min) ? '—' : min >= 120 ? `${fmt.h(min / 60)} ч` : `${fmt.min(min)} мин`);

/** Этапы процесса: время, ожидание, ресурс и его загрузка */
export function StageTable({ result, ids }: { result: TwinResult; ids: StageId[] }) {
  const stats = stageStats(result);
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr><th>Этап</th><th className="hide-sm">Ресурс</th><th className="r">Время</th><th className="r hide-sm">Ожидание</th><th>Загрузка</th></tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const s = STAGES[id];
            const st = stats[id];
            const r = s.resource ? result.resources.find((x) => x.id === s.resource) : null;
            return (
              <tr key={id}>
                <td><b>{s.title}</b></td>
                <td className="muted hide-sm">{s.resource ? RESOURCE_LABEL[s.resource] : '—'}</td>
                <td className="r num">{id === 'I1' ? 'непрерывно' : st ? dur(st.work) : '—'}</td>
                <td className={`r num hide-sm ${st && st.wait > 5 ? 'warn' : 'muted'}`}>{st && st.wait > 0.5 ? dur(st.wait) : '—'}</td>
                <td>{r ? <div className="meter-cell"><Meter value={r.utilization} tone={r.utilization > 0.85 ? 'warn' : 'ok'} /><span className="num">{fmt.pct(r.utilization)}%</span></div> : <span className="muted">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
