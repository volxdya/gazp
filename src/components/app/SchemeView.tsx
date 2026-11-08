'use client';

import { useMemo } from 'react';
import { ArrowRight, Box, Pause, Play } from 'lucide-react';
import { fmtClock, type TruckTrace, type TwinResult } from '@/lib/twin/sim';
import { POIS, PROCESS_LABEL, type PoiId } from '@/lib/twin/pois';
import { fmt, liveAt, pinStatuses } from '@/lib/twin/derive';

/**
 * Мнемосхема участка (вид строго сверху). Те же координаты, что и у 3D-сцены:
 * мир X ∈ [-92, 62], Z ∈ [-64, 54] → SVG.
 */
const K = 7.2;
const X = (x: number) => (x + 92) * K;
const Y = (z: number) => (z + 64) * K;
const W = 154 * K, H = 118 * K;
const SOUTH = 22, NORTH = -18;
/** где ставить подпись зоны, если левый верхний угол занят соседом */
const TAG_POS: Partial<Record<PoiId, [number, number]>> = { filling: [19, 49.5], lab: [-40, 12], pumps: [44, -22], warehouse: [41, 29] };

const laneZ = (i: number, n: number) => 4 + (i - (Math.min(n, 6) - 1) / 2) * 5.6;

function truckSpot(t: TruckTrace, now: number, order: Map<number, number>, nBays: number): { x: number; z: number; rot: number } | null {
  if (now < t.arrive || now >= t.exit + 0.5) return null;
  const k = order.get(t.id) ?? 0;
  if (!(now >= t.gateStart)) return { x: -62 - 13 * (k + 1), z: SOUTH, rot: 0 };
  if (!(now >= t.gateEnd)) return { x: -62, z: SOUTH, rot: 0 };
  if (!(now >= t.tareStart)) return { x: -51, z: SOUTH, rot: 0 };
  if (!(now >= t.tareEnd)) return { x: -40, z: SOUTH, rot: 0 };
  if (!(now >= t.bayStart)) { const s = Math.min(k, 11); return s < 6 ? { x: -28 + s * 5.5, z: 33, rot: 90 } : { x: -25.25 + (s - 6) * 5.5, z: 45.5, rot: 90 }; }
  if (!(now >= t.bayEnd)) return { x: 8, z: laneZ(t.bay % 6, nBays), rot: 0 };
  if (!(now >= t.grossStart)) return { x: -13 + 13 * k, z: NORTH, rot: 180 };
  if (!(now >= t.grossEnd)) return { x: -26, z: NORTH, rot: 180 };
  return { x: -45, z: NORTH, rot: 180 };
}

interface Props {
  result: TwinResult;
  time: number;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  seek: (t: number) => void;
  selected: PoiId | null;
  setSelected: (id: PoiId | null) => void;
  open3d: (id: PoiId) => void;
}

export default function SchemeView({ result, time, playing, setPlaying, seek, selected, setSelected, open3d }: Props) {
  const live = useMemo(() => liveAt(result, time), [result, time]);
  const st = useMemo(() => pinStatuses(result, live), [result, live]);
  const p = result.params;
  const nBays = Math.min(p.bays, 6);

  const trucks = useMemo(() => {
    const waitGate = result.trucks.filter((t) => time >= t.arrive && !(time >= t.gateStart)).sort((a, b) => a.arrive - b.arrive);
    const waitLot = result.trucks.filter((t) => time >= t.tareEnd && !(time >= t.bayStart)).sort((a, b) => a.tareEnd - b.tareEnd);
    const waitOut = result.trucks.filter((t) => time >= t.bayEnd && !(time >= t.grossStart)).sort((a, b) => a.bayEnd - b.bayEnd);
    const order = new Map<number, number>();
    [waitGate, waitLot, waitOut].forEach((l) => l.forEach((t, i) => order.set(t.id, i)));
    return result.trucks.map((t) => ({ t, spot: truckSpot(t, time, order, p.bays) })).filter((x) => x.spot);
  }, [result, time, p.bays]);

  const unloading = live.unloading > 0;
  const feeding = live.pumpBusy && live.blending > 0;
  const poi = selected ? POIS.find((x) => x.id === selected)! : null;
  const zone = (id: PoiId) => POIS.find((x) => x.id === id)!.zone;
  const sel = (id: PoiId) => ({ onClick: () => setSelected(selected === id ? null : id), className: `hz ${selected === id ? 'on' : ''}`, role: 'button', tabIndex: 0, 'aria-label': POIS.find((x) => x.id === id)!.title, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(id); } } });
  const hot = (id: PoiId) => { const [x0, z0, x1, z1] = zone(id); return <rect x={X(x0)} y={Y(z0)} width={(x1 - x0) * K} height={(z1 - z0) * K} rx={14} {...sel(id)} />; };
  const tankX = [0, 12, 24, 36];

  return (
    <div className="scheme">
      <section className="card scheme-stage">
        <header className="sec-head">
          <div><h2>Схема участка</h2><p>Мнемосхема в реальном времени модели: цистерны, уровни, потоки и состояние оборудования</p></div>
          <div className="scheme-clock">
            <button className="play sm" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Пауза' : 'Запустить'}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button>
            <b className="num">{fmtClock(time)}</b>
            <input type="range" className="scrub" min={0} max={Math.ceil(result.horizon)} step={0.5} value={Math.min(time, result.horizon)} onChange={(e) => seek(Number(e.target.value))} aria-label="Время смены" style={{ '--fill': `${(Math.min(time, result.horizon) / result.horizon) * 100}%` } as React.CSSProperties} />
          </div>
        </header>
        <div className="scheme-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} className="scheme-svg" role="img" aria-label="Мнемосхема участка технических масел">
            <defs>
              <pattern id="grid" width={K * 4} height={K * 4} patternUnits="userSpaceOnUse"><path d={`M ${K * 4} 0 L 0 0 0 ${K * 4}`} fill="none" stroke="#e6ebf2" strokeWidth="1" /></pattern>
              <marker id="arr" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#9aa6bd" /></marker>
            </defs>
            <rect x={X(-90)} y={Y(-62)} width={150 * K} height={114 * K} rx={22} className="s-site" />
            <rect x={X(-90)} y={Y(-62)} width={150 * K} height={114 * K} rx={22} fill="url(#grid)" />

            {/* дороги */}
            <rect x={X(-92)} y={Y(SOUTH - 4.5)} width={76 * K} height={9 * K} className="s-road" />
            <rect x={X(-92)} y={Y(NORTH - 4.5)} width={76 * K} height={9 * K} className="s-road" />
            <rect x={X(-16)} y={Y(-22)} width={54 * K} height={48 * K} rx={10} className="s-road" />
            <rect x={X(-32)} y={Y(27)} width={36 * K} height={25 * K} rx={10} className="s-road" />
            <line x1={X(-90)} y1={Y(SOUTH)} x2={X(-18)} y2={Y(SOUTH)} className="s-dash" markerEnd="url(#arr)" />
            <line x1={X(36)} y1={Y(NORTH)} x2={X(-88)} y2={Y(NORTH)} className="s-dash" markerEnd="url(#arr)" />
            <text x={X(-86)} y={Y(SOUTH) - 22} className="s-small">въезд цистерн</text>
            <text x={X(-86)} y={Y(NORTH) + 30} className="s-small">выезд</text>

            {/* трубопроводы */}
            <path d={`M ${X(14)} ${Y(-12)} L ${X(14)} ${Y(-16)} L ${X(44)} ${Y(-16)} L ${X(44)} ${Y(-27)}`} className={`s-pipe ext ${unloading ? 'flow' : ''}`} />
            <path d={`M ${X(46)} ${Y(-27)} L ${X(46)} ${Y(-29)} L ${X(40)} ${Y(-29)} L ${X(40)} ${Y(-33)}`} className={`s-pipe ext ${unloading ? 'flow' : ''}`} />
            <path d={`M ${X(54.5)} ${Y(-27)} L ${X(58)} ${Y(-27)} L ${X(58)} ${Y(34)} L ${X(17)} ${Y(34)}`} className={`s-pipe int ${feeding ? 'flow' : ''}`} />
            <path d={`M ${X(17)} ${Y(40)} L ${X(19)} ${Y(40)}`} className="s-pipe int" />
            <path d={`M ${X(-36)} ${Y(8)} L ${X(-36)} ${Y(12)} L ${X(-10)} ${Y(12)}`} className="s-sample" />
            <path d={`M ${X(-32)} ${Y(4)} C ${X(-10)} ${Y(4)}, ${X(-6)} ${Y(30)}, ${X(12)} ${Y(32)}`} className="s-sample" />

            {/* КПП, весы */}
            <g>
              <rect x={X(-75)} y={Y(-2)} width={6 * K} height={8 * K} rx={6} className="s-bld" />
              <rect x={X(-48)} y={Y(SOUTH - 2.1)} width={16 * K} height={4.2 * K} rx={4} className="s-scale" />
              <rect x={X(-34)} y={Y(NORTH - 2.1)} width={16 * K} height={4.2 * K} rx={4} className="s-scale" />
              <line x1={X(-56)} y1={Y(SOUTH - 4.5)} x2={X(-56)} y2={Y(SOUTH + 4.5)} className="s-barrier" />
              <line x1={X(-56)} y1={Y(NORTH - 4.5)} x2={X(-56)} y2={Y(NORTH + 4.5)} className="s-barrier" />
            </g>
            {/* здание: диспетчерская + лаборатория */}
            <rect x={X(-58)} y={Y(-10)} width={26 * K} height={18 * K} rx={8} className="s-bld" />
            <rect x={X(-40)} y={Y(-10)} width={8 * K} height={18 * K} rx={6} className={`s-lab ${live.labBusy ? 'busy' : ''}`} />
            <text x={X(-56)} y={Y(-1)} className="s-label">Диспетчерская</text>
            <text x={X(-39.2)} y={Y(-1)} className="s-label sm">Лаб.</text>

            {/* площадка ожидания */}
            {Array.from({ length: 12 }, (_, s) => { const x = s < 6 ? -28 + s * 5.5 : -25.25 + (s - 6) * 5.5; const z = s < 6 ? 33 : 45.5; return <rect key={s} x={X(x - 2)} y={Y(z - 5)} width={4 * K} height={10 * K} rx={3} className="s-slot" />; })}

            {/* посты слива */}
            <rect x={X(-8)} y={Y(laneZ(0, nBays) - 4)} width={32 * K} height={(laneZ(nBays - 1, nBays) - laneZ(0, nBays) + 8) * K} rx={10} className="s-canopy" />
            {Array.from({ length: nBays }, (_, i) => {
              const z = laneZ(i, nBays);
              const busy = result.trucks.some((t) => t.bay === i && time >= t.bayStart && time < t.bayEnd);
              const flow = result.trucks.some((t) => t.bay === i && time >= t.fillStart && time < t.fillEnd);
              return (
                <g key={i}>
                  <rect x={X(-2)} y={Y(z - 1.6)} width={20 * K} height={3.2 * K} rx={4} className={`s-lane ${flow ? 'flow' : busy ? 'busy' : ''}`} />
                  <text x={X(-6.5)} y={Y(z) + 4} className="s-small">№{i + 1}</text>
                </g>
              );
            })}

            {/* резервуары */}
            <rect x={X(-6.7)} y={Y(-50.5)} width={49.4 * K} height={25 * K} rx={10} className="s-bund" />
            {tankX.map((x, i) => {
              const lv = i < 2 ? live.levelA : live.levelB;
              const r = 5 * K;
              return (
                <g key={i}>
                  <clipPath id={`tc${i}`}><circle cx={X(x)} cy={Y(-38)} r={r} /></clipPath>
                  <circle cx={X(x)} cy={Y(-38)} r={r} className="s-tank" />
                  <rect x={X(x) - r} y={Y(-38) + r - 2 * r * lv} width={2 * r} height={2 * r * lv} clipPath={`url(#tc${i})`} className={`s-level ${i < 2 ? 'a' : 'b'} ${lv > 0.9 ? 'full' : ''}`} />
                  <circle cx={X(x)} cy={Y(-38)} r={r} className="s-tank-ring" />
                  <text x={X(x)} y={Y(-38) - 4} textAnchor="middle" className="s-tank-t">{i < 2 ? 'A' : 'B'}-{(i % 2) + 1}</text>
                  <text x={X(x)} y={Y(-38) + 16} textAnchor="middle" className="s-tank-v num">{fmt.pct(lv)}%</text>
                </g>
              );
            })}
            {/* насосная */}
            <rect x={X(45.5)} y={Y(-35)} width={9 * K} height={7 * K} rx={6} className={`s-bld pump ${live.pumpBusy ? 'busy' : ''}`} />
            <text x={X(46.6)} y={Y(-31)} className="s-label sm">Насосная</text>

            {/* цех: смесители, линия, склад */}
            <rect x={X(10)} y={Y(30)} width={46 * K} height={20 * K} rx={10} className="s-hall" />
            <line x1={X(40)} y1={Y(30)} x2={X(40)} y2={Y(50)} className="s-wall" />
            {[34, 46].slice(0, p.blenders).map((bz, i) => (
              <g key={bz}>
                <circle cx={X(14.5)} cy={Y(bz)} r={2.1 * K} className={`s-blender ${i < live.blending ? 'busy' : ''}`} />
                <text x={X(14.5)} y={Y(bz) + 4} textAnchor="middle" className="s-small b">См{i + 1}</text>
              </g>
            ))}
            <rect x={X(15)} y={Y(39.25)} width={22 * K} height={1.5 * K} rx={4} className={`s-line ${live.lineBusy ? 'busy' : ''}`} />
            {live.lineBusy > 0 && Array.from({ length: 8 }, (_, i) => <circle key={i} cx={X(16 + ((i * 2.8 + time * 3) % 21))} cy={Y(40)} r={4} className="s-drum" />)}
            <text x={X(20)} y={Y(37)} className="s-label sm">Фасовка</text>
            {Array.from({ length: 12 }, (_, i) => <rect key={i} x={X(42 + (i % 4) * 3.4)} y={Y(32 + Math.floor(i / 4) * 5.5)} width={2.6 * K} height={2.2 * K} rx={3} className={`s-pallet ${i < Math.floor(live.packed / 60) ? 'on' : ''}`} />)}
            <text x={X(42)} y={Y(49)} className="s-label sm">Склад</text>

            {/* автоцистерны */}
            {trucks.map(({ t, spot }) => (
              <g key={t.id} className="s-truck" style={{ transform: `translate(${X(spot!.x)}px, ${Y(spot!.z)}px) rotate(${spot!.rot}deg)` }}>
                <rect x={-5.2 * K} y={-1.25 * K} width={8 * K} height={2.5 * K} rx={9} className={t.component === 0 ? 'ta' : 'tb'} />
                <rect x={3.2 * K} y={-1.15 * K} width={2.1 * K} height={2.3 * K} rx={4} className="tcab" />
              </g>
            ))}

            {/* зоны-кнопки и подписи */}
            {POIS.map((x) => <g key={x.id}>{hot(x.id)}</g>)}
            {POIS.map((x) => {
              const [x0, z0] = TAG_POS[x.id] ?? x.zone;
              const s = st[x.id];
              const w = x.title.length * 8.4 + 40 + s.text.length * 6.6;
              const tx = Math.min(X(x0) + 6, W - w - 10);
              return (
                <g key={`l${x.id}`} className="s-tag" transform={`translate(${tx}, ${Y(z0) - 12})`} pointerEvents="none">
                  <rect width={w} height={24} rx={8} className={`tag ${x.process} ${selected === x.id ? 'on' : ''}`} />
                  <text x={10} y={16} className="tag-n">{x.n}</text>
                  <text x={26} y={16} className="tag-t">{x.title}</text>
                  <text x={34 + x.title.length * 8.4} y={16} className={`tag-s ${s.tone}`}>{s.text}</text>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="scheme-legend">
          <span><i className="lg-ext" /> приём автоцистерн</span>
          <span><i className="lg-shared" /> общие ресурсы</span>
          <span><i className="lg-int" /> производство</span>
          <span><i className="lg-flow" /> поток продукта</span>
          <span><i className="lg-sample" /> движение проб</span>
          <span><i className="lg-ta" /> цистерна с A</span>
          <span><i className="lg-tb" /> цистерна с B</span>
        </div>
      </section>

      <aside className="card scheme-side">
        {poi ? (
          <div className="ss-poi rise" key={poi.id}>
            <span className="poi-kicker">{PROCESS_LABEL[poi.process]}</span>
            <h2>{poi.n}. {poi.title}</h2>
            <p>{poi.about}</p>
            <div className="ss-status"><span>Сейчас</span><b className={`tone-${st[poi.id].tone}`}>{st[poi.id].text}</b></div>
            <button className="btn btn-primary btn-block" onClick={() => open3d(poi.id)}><Box size={16} /> Открыть в 3D-туре <ArrowRight size={15} /></button>
          </div>
        ) : (
          <div className="ss-poi">
            <span className="poi-kicker">Путь масла</span>
            <h2>Нажмите на зону схемы</h2>
            <p>Узнаете, что там происходит сейчас, и сможете перейти к этому месту в 3D-туре.</p>
          </div>
        )}
        <ol className="ss-chain">
          {['Автоцистерна', 'Приём', 'Резервуары', 'Подача в цех', 'Смешивание', 'Контроль качества', 'Фасовка', 'Склад'].map((s, i) => <li key={s} className={i < 2 ? 'ext' : i === 2 ? 'shared' : 'int'}><span>{i + 1}</span>{s}</li>)}
        </ol>
        <div className="ss-kpi">
          <div><span>Цистерн на базе</span><b className="num">{live.onSite}</b></div>
          <div><span>Слито сырья</span><b className="num">{fmt.int(live.received)} м³</b></div>
          <div><span>Партий готово</span><b className="num">{live.batchesDone} / {p.batches}</b></div>
          <div><span>Бочек на складе</span><b className="num">{fmt.int(live.packed)}</b></div>
        </div>
      </aside>
    </div>
  );
}
