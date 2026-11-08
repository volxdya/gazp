'use client';

import { fmtClock, type TwinResult } from '@/lib/twin/sim';
import { segmentsOf } from '@/lib/twin/derive';

export interface Series { name: string; color: string; points: { t: number; v: number }[]; dashed?: boolean; area?: boolean }

/** Простой линейный график по времени смены */
export function LineChart({ series, end, max, time, height = 180, unit = '' }: { series: Series[]; end: number; max?: number; time?: number; height?: number; unit?: string }) {
  const W = 600, H = height, P = { l: 30, r: 8, t: 10, b: 22 };
  const top = max ?? Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.v)));
  const x = (t: number) => P.l + (t / end) * (W - P.l - P.r);
  const y = (v: number) => H - P.b - (v / top) * (H - P.t - P.b);
  const path = (s: Series) => s.points.filter((p) => p.t <= end).map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const ticks = [0, 0.5, 1].map((k) => top * k);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map((s) => s.name).join(', ')}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="#eef0f3" />
            <text x={P.l - 6} y={y(v) + 4} textAnchor="end" fontSize="10.5" fill="#94a3b8">{unit === '%' ? Math.round(v * 100) : Math.round(v)}</text>
          </g>
        ))}
        {Array.from({ length: Math.floor(end / 120) + 1 }, (_, i) => <text key={i} x={x(i * 120)} y={H - 5} fontSize="10.5" fill="#94a3b8" textAnchor="middle">{fmtClock(i * 120)}</text>)}
        {series.map((s) => (
          <g key={s.name}>
            {s.area && <path d={`${path(s)} L${x(Math.min(end, s.points.at(-1)?.t ?? 0))},${y(0)} L${x(0)},${y(0)} Z`} fill={s.color} opacity=".08" />}
            <path d={path(s)} fill="none" stroke={s.color} strokeWidth={s.dashed ? 1.5 : 2} strokeDasharray={s.dashed ? '4 4' : undefined} strokeLinejoin="round" />
          </g>
        ))}
        {time != null && <line x1={x(Math.min(time, end))} x2={x(Math.min(time, end))} y1={P.t} y2={H - P.b} stroke="#0f172a" strokeOpacity=".25" />}
      </svg>
      <div className="chart-legend">
        {series.map((s) => <span key={s.name}><i style={{ background: s.dashed ? 'transparent' : s.color, borderColor: s.color }} className={s.dashed ? 'dashed' : ''} />{s.name}</span>)}
      </div>
    </div>
  );
}

/** Путь каждой автоцистерны по этапам */
export function Gantt({ result, time, limit = 14 }: { result: TwinResult; time: number; limit?: number }) {
  const end = Math.max(result.horizon, 1);
  const rows = result.trucks.filter((t) => Number.isFinite(t.exit)).slice(0, limit);
  return (
    <div className="gantt">
      {rows.map((t) => (
        <div className="g-row" key={t.id}>
          <span className="g-plate mono">{t.plate}</span>
          <div className="g-track">
            {segmentsOf(t).map((sg, i) => <i key={i} className={`g-${sg.k}`} style={{ left: `${(sg.a / end) * 100}%`, width: `${((sg.b - sg.a) / end) * 100}%` }} />)}
            <span className="g-now" style={{ left: `${(Math.min(time, end) / end) * 100}%` }} />
          </div>
          <span className="g-total num">{Math.round(t.exit - t.arrive)} мин</span>
        </div>
      ))}
      <div className="g-legend"><span><i className="g-gate" />КПП</span><span><i className="g-scale" />весы, контроль</span><span><i className="g-wait" />ожидание</span><span><i className="g-bay" />пост</span><span><i className="g-fill" />слив</span><span><i className="g-out" />выезд</span></div>
    </div>
  );
}
