'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import type { TwinParams, TwinResult } from '@/lib/twin/sim';
import { fmt, liveAt } from '@/lib/twin/derive';
import { Stepper, Switch } from '@/components/ui/Stepper';
import { DailyBars } from './charts';
import { Kpi, Panel } from './ui';

interface Props { result: TwinResult; apply: (p: TwinParams) => void; busy: boolean; canRun: boolean; time: number }

export default function PlanView({ result, apply, busy, canRun, time }: Props) {
  const p = result.params, m = result.metrics;
  const live = useMemo(() => liveAt(result, time), [result, time]);
  const [d, setD] = useState<TwinParams>(p);
  useEffect(() => setD(p), [p]);
  const dirty = JSON.stringify(d) !== JSON.stringify(p);
  const yieldPct = d.crudeT ? Math.round(((d.plan92 + d.plan95) / d.crudeT) * 100) : 0;
  const trucksMonth = Math.round((d.plan92 + d.plan95) / d.truckT);
  const rateTph = (d.plan92 + d.plan95) / (d.days * 24);
  const weeks = useMemo(() => {
    const out: { w: number; plan: number; shipped: number; blockedH: number; maxQ: number }[] = [];
    result.daily.forEach((x, i) => {
      const w = Math.floor(i / 7);
      out[w] ??= { w: w + 1, plan: 0, shipped: 0, blockedH: 0, maxQ: 0 };
      out[w].plan += x.plan; out[w].shipped += x.shipped; out[w].blockedH += x.blockedH; out[w].maxQ = Math.max(out[w].maxQ, x.maxQueue);
    });
    return out;
  }, [result]);

  const num = (k: keyof TwinParams, label: string, step = 1000) => (
    <label className="plan-field">
      <span>{label}</span>
      <input className="input num" type="number" min={0} step={step} value={d[k] as number} disabled={!canRun} onChange={(e) => setD({ ...d, [k]: Number(e.target.value) })} />
    </label>
  );

  return (
    <div className="stack">
      <section className="plan-chain" aria-label="План месяца">
        <div><span>Нефть в переработку</span><b className="num">{fmt.int(d.crudeT)} т</b></div>
        <ArrowRight size={18} />
        <div className="g92"><span>АИ-92 К5</span><b className="num">{fmt.int(d.plan92)} т</b></div>
        <div className="g95"><span>АИ-95 К5</span><b className="num">{fmt.int(d.plan95)} т</b></div>
        <ArrowRight size={18} />
        <div><span>Отгрузить автоцистернами</span><b className="num">≈ {fmt.int(trucksMonth)} машин</b></div>
      </section>

      <div className="kpi-row">
        <Kpi label="Выполнение плана" value={(m.planDone * 100).toFixed(1).replace('.', ',')} unit="%" />
        <Kpi label="Отгружено сейчас" value={fmt.t(live.shippedT)} unit="т" />
        <Kpi label="Затаривание за месяц" value={fmt.h(m.blockedHours)} unit="ч" />
        <Kpi label="Недовыпуск" value={fmt.t(m.lostT)} unit="т" />
      </div>

      <div className="grid-2">
        <Panel title="Настройки плана">
          {!canRun && <p className="muted locked"><Lock size={14} /> Менять план может диспетчер или руководитель</p>}
          <div className="plan-form">
            {num('crudeT', 'Нефть, т/мес')}
            {num('plan92', 'АИ-92 К5, т/мес')}
            {num('plan95', 'АИ-95 К5, т/мес')}
          </div>
          <p className="plan-note muted">Выход бензина {yieldPct}% · установка ≈ {Math.round(rateTph)} т/ч</p>
          <div className="form">
            <div className="form-row"><span>Резервуаров АИ-92</span><Stepper label="Резервуаров АИ-92" value={d.tanks92} min={1} max={6} onChange={(v) => setD({ ...d, tanks92: v })} disabled={!canRun} /></div>
            <div className="form-row"><span>Резервуаров АИ-95</span><Stepper label="Резервуаров АИ-95" value={d.tanks95} min={1} max={6} onChange={(v) => setD({ ...d, tanks95: v })} disabled={!canRun} /></div>
            <div className="form-row"><span>Постов налива</span><Stepper label="Постов налива" value={d.posts} min={1} max={6} onChange={(v) => setD({ ...d, posts: v })} disabled={!canRun} /></div>
            <div className="form-row"><span>Подъезд машин, % от нужного</span><Stepper label="Подъезд машин" value={Math.round(d.supply * 100)} min={50} max={150} step={5} onChange={(v) => setD({ ...d, supply: v / 100 })} disabled={!canRun} /></div>
            <div className="form-row"><span>Анализ резервуара, ч</span><Stepper label="Анализ, ч" value={d.qcHours} min={1} max={12} step={0.5} onChange={(v) => setD({ ...d, qcHours: v })} disabled={!canRun} format={(v) => String(v).replace('.', ',')} /></div>
            <label className="form-row"><span>Слоты подъезда 24/7</span><Switch label="Слоты 24/7" checked={d.profile === 'slots'} onChange={(v) => setD({ ...d, profile: v ? 'slots' : 'uneven' })} disabled={!canRun} /></label>
            {canRun && <button className="btn btn-primary btn-block" onClick={() => apply(d)} disabled={busy || !dirty}>{busy ? 'Считаем…' : 'Пересчитать месяц'}</button>}
          </div>
        </Panel>

        <Panel title="План и факт по дням">
          <DailyBars days={result.daily} plan={(p.plan92 + p.plan95) / p.days} time={time} />
        </Panel>
      </div>

      <Panel title="По неделям" flush>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Неделя</th><th className="r">План, т</th><th className="r">Отгружено, т</th><th className="r">Затаривание</th><th className="r hide-sm">Очередь, макс</th></tr></thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.w}>
                  <td><b>{w.w}</b></td>
                  <td className="r num muted">{fmt.int(w.plan)}</td>
                  <td className="r num"><b>{fmt.int(w.shipped)}</b></td>
                  <td className={`r num ${w.blockedH > 0 ? 'warn' : 'muted'}`}>{w.blockedH > 0 ? `${fmt.h(w.blockedH)} ч` : '—'}</td>
                  <td className="r num hide-sm">{w.maxQ}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
