'use client';

import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import type { TwinResult } from '@/lib/twin/sim';
import { PHOTOS, POIS, TOUR_ORDER, type PoiId, type ProcessKind } from '@/lib/twin/pois';
import { fmt, liveAt, pinStatuses, tanksAt } from '@/lib/twin/derive';

/** Мнемосхема: приготовление и хранение бензина → налив автоцистерн */

type Kind = 'plant' | 'tanks' | 'lab' | 'meter' | 'lot' | 'bays' | 'count';
interface Tile { id: PoiId; x: number; y: number; w: number; kind: Kind }

const H = 150;
const L1 = 46, L2 = 276;
const TILES: Tile[] = [
  { id: 'blend', x: 40, y: L1, w: 200, kind: 'plant' },
  { id: 'tanks', x: 280, y: L1, w: 420, kind: 'tanks' },
  { id: 'lab', x: 740, y: L1, w: 180, kind: 'lab' },
  { id: 'pumps', x: 960, y: L1, w: 200, kind: 'meter' },
  { id: 'gate', x: 40, y: L2, w: 180, kind: 'meter' },
  { id: 'lot', x: 260, y: L2, w: 260, kind: 'lot' },
  { id: 'bays', x: 560, y: L2, w: 340, kind: 'bays' },
  { id: 'exit', x: 940, y: L2, w: 220, kind: 'count' }
];
const LANES: { y: number; label: string; kind: ProcessKind }[] = [
  { y: L1 - 16, label: 'ПРИГОТОВЛЕНИЕ И ХРАНЕНИЕ', kind: 'internal' },
  { y: L2 - 16, label: 'НАЛИВ АВТОЦИСТЕРН', kind: 'external' }
];
const STATE_CLASS = { fill: 'st-fill', qc: 'st-qc', ship: 'st-ship', empty: 'st-empty' } as const;
const toneOf = (t: string) => (t === 'warn' ? 'warn' : t === 'busy' ? 'busy' : 'ok');

export default function SiteMap({ result, time, selected, onOpen }: { result: TwinResult; time: number; selected: PoiId | null; onOpen: (id: PoiId) => void }) {
  const live = useMemo(() => liveAt(result, time), [result, time]);
  const st = useMemo(() => pinStatuses(result, live), [result, live]);
  const tk = tanksAt(result, time);
  const p = result.params;
  const blocked = live.blocked[0] || live.blocked[1];
  const waiting = useMemo(() => result.trucks.filter((t) => t.arrive <= time && time >= t.gateEnd && !(time >= t.bayStart)).slice(0, 10), [result, time]);
  const bayState = Array.from({ length: Math.min(p.posts, 6) }, (_, i) => {
    const t = result.trucks.find((x) => x.bay === i && time >= x.bayStart && time < x.bayEnd);
    return !t ? 'free' : time >= t.fillStart && time < t.fillEnd ? 'flow' : 'busy';
  });
  const gateU = result.resources.find((r) => r.id === 'gate')?.utilization ?? 0;

  const viz = (t: Tile) => {
    const inner = t.w - 36;
    switch (t.kind) {
      case 'plant':
        return (
          <g transform="translate(18, 86)">
            <rect width={inner} height={8} rx={4} className="m-track" />
            <rect width={inner} height={8} rx={4} className={blocked ? 'm-fill hot' : 'm-fill int'} />
            <text y={-8} className="m-cap">≈ {Math.round((p.plan92 + p.plan95) / (p.days * 24))} т/ч</text>
          </g>
        );
      case 'tanks': {
        const n = result.tanks.length;
        const gap = 8, bw = Math.min(34, (inner - gap * (n - 1)) / Math.max(1, n));
        return (
          <g transform="translate(18, 66)">
            {result.tanks.map((x, i) => {
              const lv = tk.lv[i] ?? 0;
              return (
                <g key={x.id} transform={`translate(${i * (bw + gap)}, 0)`}>
                  <rect width={bw} height={46} rx={6} className="tank-box" />
                  <rect y={46 - 46 * lv} width={bw} height={46 * lv} rx={6} className={`tank-lvl ${x.grade === 0 ? 'g92' : 'g95'}`} />
                  <circle cx={bw / 2} cy={-6} r={3.5} className={`tank-st ${STATE_CLASS[tk.st[i] ?? 'empty']}`} />
                  <text x={bw / 2} y={60} textAnchor="middle" className="m-cap tiny">{x.name}</text>
                </g>
              );
            })}
          </g>
        );
      }
      case 'lab': {
        const qc = live.byGrade[0].qc + live.byGrade[1].qc;
        return <text x={18} y={108} className="big num">{qc}<tspan className="big-unit"> на анализе</tspan></text>;
      }
      case 'meter': {
        const u = t.id === 'gate' ? gateU : live.baysBusy / Math.max(1, p.posts);
        return (
          <g transform="translate(18, 92)">
            <rect width={inner} height={6} rx={3} className="m-track" />
            <rect width={Math.max(4, inner * u)} height={6} rx={3} className={`m-fill ${u > 0.85 ? 'hot' : ''}`} />
          </g>
        );
      }
      case 'lot':
        return (
          <g transform="translate(18, 80)">
            {Array.from({ length: 10 }, (_, i) => {
              const tr = waiting[i];
              const w = (inner - 9 * 5) / 10;
              return <rect key={i} x={i * (w + 5)} width={w} height={22} rx={5} className={tr ? (tr.component === 0 ? 'truck a' : 'truck b') : 'slot'} />;
            })}
          </g>
        );
      case 'bays':
        return (
          <g transform="translate(18, 72)">
            {bayState.map((s, i) => <rect key={i} y={i * 10} width={inner} height={6} rx={3} className={`lane ${s}`} />)}
          </g>
        );
      case 'count':
        return <text x={18} y={110} className="big num">{fmt.int(live.served)}<tspan className="big-unit"> машин · {fmt.t(live.shippedT)} т</tspan></text>;
    }
  };

  return (
    <div className="sitemap">
      <svg viewBox="0 0 1200 470" className="sitemap-svg" role="group" aria-label="Схема участка">
        <defs>
          <marker id="sm-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className="arr" /></marker>
        </defs>
        {LANES.map((l) => (
          <g key={l.label}>
            <circle cx={46} cy={l.y - 4} r={4} className={`lane-dot ${l.kind}`} />
            <text x={58} y={l.y} className="lane-label">{l.label}</text>
          </g>
        ))}
        <g className="links">
          <line x1={240} y1={L1 + H / 2} x2={278} y2={L1 + H / 2} className={`pipe int ${blocked ? '' : 'on'}`} markerEnd="url(#sm-arr)" />
          <line x1={700} y1={L1 + H / 2} x2={738} y2={L1 + H / 2} className="sample" />
          <path d={`M600,${L1 + H} V${L1 + H + 20} H1060 V${L1 + H + 2}`} className={`pipe ext ${live.loading ? 'on' : ''}`} />
          <path d={`M1060,${L1 + H + 20} V${L2 - 24} H730 V${L2 - 2}`} className={`pipe ext ${live.loading ? 'on' : ''}`} markerEnd="url(#sm-arr)" />
          {[[220, 260], [520, 560], [900, 940]].map(([a, b]) => <line key={a} x1={a} y1={L2 + H / 2} x2={b - 2} y2={L2 + H / 2} className="flow ext" markerEnd="url(#sm-arr)" />)}
        </g>
        <g transform={`translate(40, ${L2 + H + 24})`} className="legend-svg">
          <circle cx={6} cy={-4} r={4} className="tank-st st-fill" /><text x={16} y={0}>наполнение</text>
          <circle cx={116} cy={-4} r={4} className="tank-st st-qc" /><text x={126} y={0}>анализ</text>
          <circle cx={196} cy={-4} r={4} className="tank-st st-ship" /><text x={206} y={0}>на наливе</text>
          <circle cx={296} cy={-4} r={4} className="tank-st st-empty" /><text x={306} y={0}>свободен</text>
          <rect x={390} y={-10} width={12} height={12} rx={3} className="truck a" /><text x={408} y={0}>АИ-92</text>
          <rect x={470} y={-10} width={12} height={12} rx={3} className="truck b" /><text x={488} y={0}>АИ-95</text>
        </g>

        {TILES.map((t) => {
          const poi = POIS.find((x) => x.id === t.id)!;
          const s = st[t.id];
          return (
            <g key={t.id} transform={`translate(${t.x}, ${t.y})`} className={`tile p-${poi.process} ${selected === t.id ? 'on' : ''}`} role="button" tabIndex={0}
              aria-label={`${poi.n}. ${poi.title}: ${s.text}`} onClick={() => onOpen(t.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(t.id); } }}>
              <rect width={t.w} height={H} rx={16} className="tile-bg" />
              <text x={18} y={32} className="tile-n num">{String(poi.n).padStart(2, '0')}</text>
              <circle cx={t.w - 20} cy={26} r={5} className={`tile-dot ${toneOf(s.tone)}`} />
              <text x={18} y={56} className="tile-title">{poi.title}</text>
              {viz(t)}
              {t.kind !== 'count' && t.kind !== 'lab' && t.kind !== 'tanks' && <text x={18} y={H - 18} className="tile-val">{s.text}</text>}
              {PHOTOS[t.id] && (
                <g transform={`translate(${t.w - 34}, ${H - 32})`} className="cam" aria-hidden>
                  <rect width={20} height={15} y={2} rx={4} /><circle cx={10} cy={9.5} r={4} /><rect x={6} width={8} height={4} rx={1.5} />
                </g>
              )}
            </g>
          );
        })}
      </svg>

      <ol className="sitemap-list" aria-label="Путь бензина">
        {TOUR_ORDER.map((id) => {
          const poi = POIS.find((x) => x.id === id)!;
          const s = st[id];
          return (
            <li key={id}>
              <button onClick={() => onOpen(id)} className={`p-${poi.process}`}>
                <span className="sl-n num">{String(poi.n).padStart(2, '0')}</span>
                <span className="sl-main"><b>{poi.title}</b><span><i className={`tile-dot-h ${toneOf(s.tone)}`} />{s.text}</span></span>
                {PHOTOS[id] && <img src={PHOTOS[id]!.main} alt="" loading="lazy" />}
                <ChevronRight size={16} className="sl-go" />
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
