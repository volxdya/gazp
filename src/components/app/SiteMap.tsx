'use client';

import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import type { TwinResult } from '@/lib/twin/sim';
import { PHOTOS, POIS, TOUR_ORDER, type PoiId, type ProcessKind } from '@/lib/twin/pois';
import { fmt, liveAt, pinStatuses } from '@/lib/twin/derive';

/**
 * Мнемосхема участка: три полосы (приём → общие ресурсы → производство),
 * плитки идут по пути масла, связи показывают потоки продукта и проб.
 */

type Kind = 'meter' | 'lot' | 'bays' | 'tanks' | 'blend' | 'filling' | 'count';
interface Tile { id: PoiId; x: number; y: number; w: number; kind: Kind }

const H = 150;
const L1 = 46, L2 = 256, L3 = 466;
const TILES: Tile[] = [
  { id: 'gate', x: 40, y: L1, w: 150, kind: 'meter' },
  { id: 'scales', x: 230, y: L1, w: 150, kind: 'meter' },
  { id: 'lot', x: 420, y: L1, w: 220, kind: 'lot' },
  { id: 'bays', x: 680, y: L1, w: 240, kind: 'bays' },
  { id: 'exit', x: 960, y: L1, w: 200, kind: 'count' },
  { id: 'control', x: 40, y: L2, w: 150, kind: 'meter' },
  { id: 'lab', x: 230, y: L2, w: 150, kind: 'meter' },
  { id: 'tanks', x: 680, y: L2, w: 240, kind: 'tanks' },
  { id: 'pumps', x: 960, y: L2, w: 200, kind: 'meter' },
  { id: 'blend', x: 960, y: L3, w: 200, kind: 'blend' },
  { id: 'filling', x: 680, y: L3, w: 240, kind: 'filling' },
  { id: 'warehouse', x: 420, y: L3, w: 220, kind: 'count' }
];

const LANES: { y: number; label: string; kind: ProcessKind }[] = [
  { y: L1 - 16, label: 'ПРИЁМ АВТОЦИСТЕРН', kind: 'external' },
  { y: L2 - 16, label: 'ОБЩИЕ РЕСУРСЫ', kind: 'shared' },
  { y: L3 - 16, label: 'ПРОИЗВОДСТВО', kind: 'internal' }
];

const toneOf = (t: string) => (t === 'warn' ? 'warn' : t === 'busy' ? 'busy' : 'ok');

export default function SiteMap({ result, time, selected, onOpen }: { result: TwinResult; time: number; selected: PoiId | null; onOpen: (id: PoiId) => void }) {
  const live = useMemo(() => liveAt(result, time), [result, time]);
  const st = useMemo(() => pinStatuses(result, live), [result, live]);
  const util = (id?: string) => (id ? result.resources.find((r) => r.id === id)?.utilization ?? 0 : 0);
  const waiting = result.trucks.filter((t) => time >= t.tareEnd && !(time >= t.bayStart));
  const bayState = Array.from({ length: Math.min(result.params.bays, 4) }, (_, i) => {
    const t = result.trucks.find((x) => x.bay === i && time >= x.bayStart && time < x.bayEnd);
    return !t ? 'free' : time >= t.fillStart && time < t.fillEnd ? 'flow' : 'busy';
  });
  const active = result.batches.find((b) => time >= b.lineStart && time < b.lineEnd);
  const fillFrac = active ? (time - active.lineStart) / Math.max(0.01, active.lineEnd - active.lineStart) : 0;
  const busyBlend = Math.min(result.params.blenders, live.blending + live.qc);
  const unloading = live.unloading > 0;
  const feeding = result.batches.some((b) => time >= b.feedStart && time < b.feedEnd);

  const viz = (t: Tile, poi: (typeof POIS)[number]) => {
    const inner = t.w - 36;
    switch (t.kind) {
      case 'meter': {
        const u = util(poi.resource);
        return (
          <g transform="translate(18, 92)">
            <rect width={inner} height={6} rx={3} className="m-track" />
            <rect width={Math.max(4, inner * u)} height={6} rx={3} className={`m-fill ${u > 0.75 ? 'hot' : ''}`} />
          </g>
        );
      }
      case 'lot':
        return (
          <g transform="translate(18, 80)">
            {Array.from({ length: 8 }, (_, i) => {
              const tr = waiting[i];
              return <rect key={i} x={i * ((inner - 7 * 6) / 8 + 6)} y={0} width={(inner - 7 * 6) / 8} height={22} rx={5} className={tr ? (tr.component === 0 ? 'truck a' : 'truck b') : 'slot'} />;
            })}
          </g>
        );
      case 'bays':
        return (
          <g transform="translate(18, 74)">
            {bayState.map((s, i) => (
              <g key={i} transform={`translate(0, ${i * 13})`}>
                <rect width={inner} height={8} rx={4} className={`lane ${s}`} />
              </g>
            ))}
          </g>
        );
      case 'tanks':
        return (
          <g transform="translate(18, 76)">
            {[['A', live.levelA, 'a'], ['B', live.levelB, 'b']].map(([n, v, c], i) => (
              <g key={n as string} transform={`translate(0, ${i * 24})`}>
                <text x={0} y={9} className="m-cap strong">{n as string}</text>
                <rect x={18} width={inner - 60} height={10} rx={5} className="m-track" />
                <rect x={18} width={Math.max(5, (inner - 60) * (v as number))} height={10} rx={5} className={`lvl ${c} ${(v as number) > 0.9 ? 'full' : ''}`} />
                <text x={inner} y={9} textAnchor="end" className="m-cap strong">{fmt.pct(v as number)}%</text>
              </g>
            ))}
          </g>
        );
      case 'blend':
        return (
          <g transform="translate(18, 76)">
            {Array.from({ length: result.params.blenders }, (_, i) => (
              <g key={i} transform={`translate(${i * 40 + 15}, 15)`}>
                <circle r={15} className={`vessel ${i < busyBlend ? 'on' : ''}`} />
                {i < busyBlend && <path d="M-7,0 H7 M0,-7 V7" className="blade" />}
              </g>
            ))}
          </g>
        );
      case 'filling':
        return (
          <g transform="translate(18, 88)">
            <rect width={inner} height={8} rx={4} className="m-track" />
            <rect width={Math.max(0, inner * fillFrac)} height={8} rx={4} className="m-fill int" />
            {active && <text y={-8} className="m-cap">партия №{active.id} · {Math.round(fillFrac * 100)}%</text>}
          </g>
        );
      case 'count':
        return <text x={18} y={110} className="big num">{t.id === 'exit' ? live.served : fmt.int(live.packed)}<tspan className="big-unit"> {t.id === 'exit' ? 'выехало' : 'бочек'}</tspan></text>;
    }
  };

  return (
    <div className="sitemap">
      <svg viewBox="0 0 1200 640" className="sitemap-svg" role="group" aria-label="Схема участка">
        <defs>
          <marker id="sm-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className="arr" /></marker>
        </defs>

        {LANES.map((l) => (
          <g key={l.label}>
            <circle cx={46} cy={l.y - 4} r={4} className={`lane-dot ${l.kind}`} />
            <text x={58} y={l.y} className="lane-label">{l.label}</text>
          </g>
        ))}

        {/* связи */}
        <g className="links">
          {[[190, 230], [380, 420], [640, 680], [920, 960]].map(([a, b]) => <line key={a} x1={a} y1={L1 + H / 2} x2={b - 2} y2={L1 + H / 2} className="flow ext" markerEnd="url(#sm-arr)" />)}
          <line x1={115} y1={L2} x2={115} y2={L1 + H + 2} className="doc" />
          <path d={`M305,${L2} V${L2 - 30} H530 V${L1 + H + 2}`} className="sample" />
          <path d={`M305,${L2 + H} V${L3 - 30} H1010 V${L3 - 2}`} className="sample" />
          <line x1={800} y1={L1 + H} x2={800} y2={L2 - 2} className={`pipe ext ${unloading ? 'on' : ''}`} markerEnd="url(#sm-arr)" />
          <line x1={920} y1={L2 + H / 2} x2={958} y2={L2 + H / 2} className={`pipe int ${feeding ? 'on' : ''}`} markerEnd="url(#sm-arr)" />
          <line x1={1110} y1={L2 + H} x2={1110} y2={L3 - 2} className={`pipe int ${feeding ? 'on' : ''}`} markerEnd="url(#sm-arr)" />
          {[[960, 920], [680, 640]].map(([a, b]) => <line key={a} x1={a} y1={L3 + H / 2} x2={b + 2} y2={L3 + H / 2} className="flow int" markerEnd="url(#sm-arr)" />)}
        </g>

        {/* легенда в свободном углу */}
        <g transform={`translate(40, ${L3 + 8})`} className="legend-svg">
          <line x1={0} y1={6} x2={26} y2={6} className="pipe ext on" /><text x={36} y={10}>слив</text>
          <line x1={0} y1={34} x2={26} y2={34} className="pipe int on" /><text x={36} y={38}>подача</text>
          <line x1={0} y1={62} x2={26} y2={62} className="sample" /><text x={36} y={66}>проба</text>
        </g>

        {TILES.map((t) => {
          const poi = POIS.find((p) => p.id === t.id)!;
          const s = st[t.id];
          return (
            <g
              key={t.id}
              transform={`translate(${t.x}, ${t.y})`}
              className={`tile p-${poi.process} ${selected === t.id ? 'on' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`${poi.n}. ${poi.title}: ${s.text}`}
              onClick={() => onOpen(t.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(t.id); } }}
            >
              <rect width={t.w} height={H} rx={16} className="tile-bg" />
              <text x={18} y={32} className="tile-n num">{String(poi.n).padStart(2, '0')}</text>
              <circle cx={t.w - 20} cy={26} r={5} className={`tile-dot ${toneOf(s.tone)}`} />
              <text x={18} y={56} className="tile-title">{poi.title}</text>
              {viz(t, poi)}
              {t.kind !== 'tanks' && t.kind !== 'count' && <text x={18} y={H - 18} className="tile-val">{s.text}</text>}
              {PHOTOS[t.id] && (
                <g transform={`translate(${t.w - 34}, ${H - 32})`} className="cam" aria-hidden>
                  <rect width={20} height={15} y={2} rx={4} />
                  <circle cx={10} cy={9.5} r={4} />
                  <rect x={6} width={8} height={4} rx={1.5} />
                </g>
              )}
            </g>
          );
        })}
      </svg>

      <ol className="sitemap-list" aria-label="Путь масла">
        {TOUR_ORDER.map((id) => {
          const poi = POIS.find((p) => p.id === id)!;
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
