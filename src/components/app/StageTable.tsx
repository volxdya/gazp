'use client';

import { RESOURCE_LABEL, type TwinResult } from '@/lib/twin/sim';
import { STAGES, type StageId } from '@/lib/twin/pois';
import { fmt, stageStats } from '@/lib/twin/derive';
import { Meter } from './ui';

/** Этапы процесса: время, ожидание, ресурс, загрузка, стоимость (требование ТЗ: «время, ресурс и стоимость узла») */
export function StageTable({ result, ids }: { result: TwinResult; ids: StageId[] }) {
  const stats = stageStats(result);
  const bn = result.metrics.bottleneck;
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr><th>Этап</th><th>Ресурс</th><th className="r">Время</th><th className="r">Ожидание</th><th>Загрузка</th><th className="r">Стоимость</th></tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const s = STAGES[id];
            const st = stats[id];
            const r = s.resource ? result.resources.find((x) => x.id === s.resource) : null;
            return (
              <tr key={id}>
                <td><b>{s.title}</b>{s.shared && <span className="tag-shared">общий ресурс</span>}</td>
                <td className="muted">{s.resource ? RESOURCE_LABEL[s.resource] : '—'}{r && r.id === bn && <span className="tag-bn">узкое место</span>}</td>
                <td className="r num">{st ? `${fmt.min(st.work)} мин` : '—'}</td>
                <td className={`r num ${st && st.wait > 5 ? 'warn' : 'muted'}`}>{st && st.wait > 0.5 ? `${fmt.min(st.wait)} мин` : '—'}</td>
                <td>{r ? <div className="meter-cell"><Meter value={r.utilization} tone={r.id === bn ? 'warn' : 'ok'} /><span className="num">{fmt.pct(r.utilization)}%</span></div> : <span className="muted">—</span>}</td>
                <td className="r num">{st ? `${fmt.int(st.cost)} ₽` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
