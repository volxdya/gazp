'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Factory, ChevronRight, Clock, Coins, Cylinder, Package, Truck, Zap, ArrowDown } from 'lucide-react';
import { fmtClock, RESOURCE_LABEL, type TwinResult } from '@/lib/twin/sim';
import { STAGES, type PoiId, type StageId } from '@/lib/twin/pois';
import { fmt, levelAt, segmentsOf, stageStats } from '@/lib/twin/derive';

const EXT: StageId[] = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6'];
const INT: StageId[] = ['I1', 'I2', 'I3', 'I4', 'I5'];

export default function ProcessView({ result, baseline, baselineName, openPoi, time }: { result: TwinResult; baseline: TwinResult; baselineName: string; openPoi: (id: PoiId) => void; time: number }) {
  const stats = useMemo(() => stageStats(result), [result]);
  const [sel, setSel] = useState<StageId>('E3');
  const m = result.metrics, b = baseline.metrics;
  const util = (id?: string) => result.resources.find((r) => r.id === id);

  const kpis = [
    { icon: <Clock size={18} />, label: 'Оборот цистерны', v: fmt.min(m.avgTurnaround), u: 'мин', d: m.avgTurnaround - b.avgTurnaround, lower: true },
    { icon: <Package size={18} />, label: 'Выполнение плана', v: String(Math.round(m.planDone * 100)), u: '%', d: (m.planDone - b.planDone) * 100, lower: false },
    { icon: <Truck size={18} />, label: 'Принято сырья', v: fmt.int(m.volume), u: 'м³', d: m.volume - b.volume, lower: false },
    { icon: <Coins size={18} />, label: 'Маржа смены', v: fmt.rub(m.margin), u: '₽', d: m.margin - b.margin, lower: false }
  ];

  const node = (id: StageId) => {
    const s = STAGES[id];
    const st = stats[id];
    const r = util(s.resource);
    const isBn = r && r.id === m.bottleneck;
    return (
      <button key={id} className={`node ${s.lane} ${s.shared ? 'shared' : ''} ${sel === id ? 'on' : ''} ${isBn ? 'bn' : ''}`} onClick={() => setSel(id)} aria-pressed={sel === id}>
        <span className="node-id">{id}</span>
        <b>{s.title}</b>
        <span className="node-res">{s.resource ? RESOURCE_LABEL[s.resource] : 'без ресурса'}{s.shared && <i className="node-shared">общий</i>}</span>
        <span className="node-time num">{st ? fmt.min(st.work) : '—'} <small>мин</small>{st && st.wait > 0.5 && <em> + {fmt.min(st.wait)} ожид.</em>}</span>
        {r && <span className="node-bar"><i style={{ width: `${r.utilization * 100}%` }} /></span>}
        {st && <span className="node-cost num">≈ {fmt.int(st.cost)} ₽</span>}
        {isBn && <span className="node-bn">узкое место</span>}
      </button>
    );
  };

  const s = STAGES[sel];
  const sr = util(s.resource);
  const shown = result.trucks.filter((t) => Number.isFinite(t.exit)).slice(0, 18);
  const end = Math.max(result.horizon, 1);

  return (
    <div className="proc">
      <div className="kpi-row">
        {kpis.map((k) => {
          const good = k.lower ? k.d < 0 : k.d > 0;
          const pct = Math.abs(k.d) / Math.max(1, Math.abs(Number(k.v.replace(/\s|,/g, '')) || 1));
          void pct;
          return (
            <div key={k.label} className="card kpi-card">
              <span className="kpi-ic">{k.icon}</span>
              <span className="kpi-l">{k.label}</span>
              <b className="num">{k.v}<small> {k.u}</small></b>
              <span className={`delta ${Math.abs(k.d) < 0.5 ? '' : good ? 'good' : 'bad'}`}>{k.d > 0 ? '+' : k.d < 0 ? '−' : ''}{k.u === '₽' ? fmt.rub(Math.abs(k.d)) : k.u === 'м³' || k.u === '%' ? fmt.int(Math.abs(k.d)) : fmt.min(Math.abs(k.d))}{k.u === '%' ? ' п.п.' : ''} к «{baselineName}»</span>
            </div>
          );
        })}
      </div>

      <section className="card bpmn" aria-label="Модель процесса">
        <header className="sec-head">
          <div><h2>Мнемосхема процессов</h2><p>Автоцистерна → приём → резервуары → подача в цех → смешивание → контроль качества → фасовка → склад</p></div>
          <span className="chip chip-orange"><Zap size={13} /> Узкое место: {RESOURCE_LABEL[m.bottleneck]}</span>
        </header>
        <div className="lanes">
          <div className="lane external">
            <div className="lane-title"><Truck size={15} /> Внешний процесс · Приём автоцистерн</div>
            <div className="lane-flow">
              <span className="evt start">Цистерна</span>
              {EXT.map((id) => <span key={id} className="flow-item"><ChevronRight size={16} className="flow-arr" />{node(id)}</span>)}
              <span className="flow-item"><ChevronRight size={16} className="flow-arr" /><span className="evt end">Выезд</span></span>
            </div>
          </div>
          <TankBand result={result} time={time} />
          <div className="lane internal">
            <div className="lane-title"><Factory size={15} /> Внутренний процесс · Производство</div>
            <div className="lane-flow">
              <span className="evt start">План партии</span>
              {INT.map((id) => <span key={id} className="flow-item"><ChevronRight size={16} className="flow-arr" />{node(id)}</span>)}
              <span className="flow-item"><ChevronRight size={16} className="flow-arr" /><span className="evt end">Готово</span></span>
            </div>
          </div>
        </div>
        <div className="stage-detail">
          <div>
            <span className="poi-kicker">{sel} · {s.lane === 'internal' ? 'внутренний процесс' : 'внешний процесс'}</span>
            <h3>{s.title}</h3>
            <p>
              Среднее время этапа — <b className="num">{stats[sel] ? fmt.min(stats[sel].work) : '—'} мин</b>
              {sr && <> · ресурс «{sr.label}» ×{sr.capacity}, загрузка <b className="num">{fmt.pct(sr.utilization)}%</b>, макс. очередь <b className="num">{sr.maxQueue}</b></>}
              {stats[sel] && <> · стоимость этапа <b className="num">≈ {fmt.int(stats[sel].cost)} ₽</b> на {s.lane === 'external' ? 'цистерну' : 'партию'}</>}
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => openPoi(s.poi)}>Показать в 3D-туре <ArrowRight size={15} /></button>
        </div>
      </section>

      <div className="proc-grid">
        <section className="card" aria-label="Загрузка ресурсов">
          <header className="sec-head"><div><h2>Загрузка ресурсов</h2><p>Доля времени смены, когда ресурс занят</p></div></header>
          <div className="bars">
            {[...result.resources].sort((a, c) => c.utilization - a.utilization).map((r) => {
              const base = baseline.resources.find((x) => x.id === r.id)!;
              return (
                <div key={r.id} className={`bar ${r.id === m.bottleneck ? 'bn' : ''}`}>
                  <span>{r.label} <small>×{r.capacity}</small></span>
                  <div className="bar-track">
                    <i className="bar-base" style={{ width: `${base.utilization * 100}%` }} />
                    <i className="bar-fill" style={{ width: `${r.utilization * 100}%` }} />
                  </div>
                  <b className="num">{fmt.pct(r.utilization)}%</b>
                </div>
              );
            })}
            <p className="foot"><i className="sw sw-base" /> «{baselineName}» <i className="sw sw-fill" /> текущий сценарий</p>
          </div>
        </section>

        <section className="card" aria-label="Машины на территории">
          <header className="sec-head"><div><h2>Цистерны на территории</h2><p>Сколько автоцистерн одновременно на базе в течение смены</p></div></header>
          <QueueChart a={baseline} b={result} time={time} />
        </section>
      </div>

      <section className="card gantt-card" aria-label="Диаграмма Ганта">
        <header className="sec-head">
          <div><h2>Путь каждой цистерны</h2><p>Где автоцистерна теряет время: {shown.length} рейсов смены</p></div>
          <div className="g-legend"><span><i className="g-gate" />КПП</span><span><i className="g-scale" />весы</span><span><i className="g-wait" />ожидание</span><span><i className="g-bay" />пост</span><span><i className="g-fill" />слив</span><span><i className="g-out" />выезд</span></div>
        </header>
        <div className="gantt">
          {shown.map((t) => (
            <div className="g-row" key={t.id}>
              <span className="g-plate num">{t.plate}</span>
              <div className="g-track">
                {segmentsOf(t).map((sg, i) => <i key={i} className={`g-${sg.k}`} style={{ left: `${(sg.a / end) * 100}%`, width: `${((sg.b - sg.a) / end) * 100}%` }} />)}
                <span className="g-now" style={{ left: `${(Math.min(time, end) / end) * 100}%` }} />
              </div>
              <span className="g-total num">{Math.round(t.exit - t.arrive)}′</span>
            </div>
          ))}
          <div className="g-axis num">{Array.from({ length: Math.floor(end / 60) + 1 }, (_, h) => <span key={h} style={{ left: `${((h * 60) / end) * 100}%` }}>{fmtClock(h * 60)}</span>)}</div>
        </div>
      </section>
    </div>
  );
}

function QueueChart({ a, b, time }: { a: TwinResult; b: TwinResult; time: number }) {
  const W = 560, H = 210, P = { l: 34, r: 12, t: 12, b: 26 };
  const end = Math.max(a.horizon, b.horizon);
  const max = Math.max(4, ...a.queueSeries.map((s) => s.onSite), ...b.queueSeries.map((s) => s.onSite));
  const x = (t: number) => P.l + (t / end) * (W - P.l - P.r);
  const y = (v: number) => H - P.b - (v / max) * (H - P.t - P.b);
  const line = (r: TwinResult) => r.queueSeries.filter((s) => s.t <= end).map((s, i) => `${i ? 'L' : 'M'}${x(s.t).toFixed(1)},${y(s.onSite).toFixed(1)}`).join(' ');
  const area = (r: TwinResult) => `${line(r)} L${x(r.queueSeries.filter((s) => s.t <= end).at(-1)!.t)},${y(0)} L${x(0)},${y(0)} Z`;
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round((max / 4) * i));
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="График числа машин на территории: базовый и текущий сценарии">
        <defs>
          <linearGradient id="qa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1d5bff" stopOpacity=".28" /><stop offset="1" stopColor="#1d5bff" stopOpacity="0" /></linearGradient>
        </defs>
        {ticks.map((v) => <g key={v}><line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="#e7ecf3" /><text x={P.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#8a97b0">{v}</text></g>)}
        {Array.from({ length: Math.floor(end / 120) + 1 }, (_, i) => <text key={i} x={x(i * 120)} y={H - 6} fontSize="11" fill="#8a97b0" textAnchor="middle">{fmtClock(i * 120)}</text>)}
        <path d={line(a)} fill="none" stroke="#b6c1d3" strokeWidth="2" strokeDasharray="5 5" />
        <path d={area(b)} fill="url(#qa)" />
        <path d={line(b)} fill="none" stroke="#1d5bff" strokeWidth="2.5" strokeLinejoin="round" />
        <line x1={x(Math.min(time, end))} x2={x(Math.min(time, end))} y1={P.t} y2={H - P.b} stroke="#ff7a1a" strokeWidth="1.5" />
      </svg>
      <p className="foot"><i className="sw sw-dash" /> было <i className="sw sw-fill" /> стало <i className="sw sw-now" /> текущее время</p>
    </div>
  );
}

function TankBand({ result, time }: { result: TwinResult; time: number }) {
  const lv = levelAt(result, time);
  const cap = result.params.tankCapacity;
  const tank = (name: string, v: number, cls: string) => (
    <div className={`tb-tank ${cls}`}>
      <div className="tb-gauge"><i style={{ height: `${Math.min(100, v * 100)}%` }} /></div>
      <div><b>Резервуар {name}</b><span className="num">{fmt.int(v * cap)} / {cap} м³ · {fmt.pct(v)}%</span>{v > 0.9 && <em>почти полон — цистерны ждут</em>}{v < 0.12 && <em>мало сырья — цех ждёт</em>}</div>
    </div>
  );
  return (
    <div className="tank-band" aria-label="Резервуары связывают процессы">
      <span className="tb-arrow"><ArrowDown size={15} /> слив пополняет</span>
      <Cylinder size={20} className="tb-ic" />
      {tank('A', lv.a, 'a')}
      {tank('B', lv.b, 'b')}
      <span className="tb-arrow"><ArrowDown size={15} /> цех забирает по рецептуре {Math.round(result.params.shareA * 100)}/{Math.round((1 - result.params.shareA) * 100)}</span>
    </div>
  );
}
