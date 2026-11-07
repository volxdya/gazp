'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { Crosshair, Minus, Plus } from 'lucide-react';
import { TOUR_POINTS, type EquipmentId } from '../lib/site';
import './FactoryMap.css';

export type MapSnapshot = { stockA: number; stockB: number; capacityA: number; capacityB: number; receivingActive: boolean; receivingTransferring?: boolean; mixingActive?: boolean; mixerActive: boolean; fillerActive: boolean; queueLength: number };
export type FactoryMapProps = { onSelectEquipment: (id: string) => void; onSelectPoint: (id: string) => void; selectedEquipment: string | null; highlightedEquipment?: string | null; snapshot?: MapSnapshot; showRoute?: boolean; playing?: boolean };
const defaultSnapshot: MapSnapshot = { stockA: 30000, stockB: 30000, capacityA: 80000, capacityB: 80000, receivingActive: false, mixerActive: false, fillerActive: false, queueLength: 0 };
const initialView = { x: 0, y: 0, w: 1200, h: 800 };
const fmt = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n / 1000);

function Truck({ x, y, horizontal = false, muted = false }: { x: number; y: number; horizontal?: boolean; muted?: boolean }) {
  return <g transform={`translate(${x} ${y}) ${horizontal ? 'rotate(-90 19 60)' : ''}`} opacity={muted ? .5 : 1}>
    <rect x="-4" y="18" width="46" height="17" rx="3" fill="#405049"/><rect x="-4" y="77" width="46" height="15" rx="3" fill="#405049"/>
    <rect x="1" y="6" width="36" height="88" rx="18" fill="url(#metal)" stroke="#8c9b97" strokeWidth="1.5"/>
    <path d="M4 27H34M3 71H35" stroke="#a6b0ab" strokeWidth="2"/><rect x="14" y="21" width="10" height="8" rx="2" fill="#adb9b3" stroke="#8d9e94"/>
    <rect x="1" y="98" width="36" height="29" rx="5" fill="#dce6de" stroke="#82958b" strokeWidth="1.5"/><rect x="5" y="112" width="28" height="8" rx="2" fill="#6c847a"/><path d="M5 124H33" stroke="#a7b3aa" strokeWidth="2"/>
  </g>;
}
function Drum({ x, y, color = '#728b7e' }: { x: number; y: number; color?: string }) { return <g><rect x={x} y={y} width="24" height="28" rx="4" fill={color} stroke="#506e60"/><path d={`M${x + 2} ${y + 7}h20m-20 14h20`} stroke="#aabbb0" strokeWidth="2"/><circle cx={x + 17} cy={y + 4} r="2" fill="#d8e0d7"/></g>; }
function Pallet({ x, y }: { x: number; y: number }) { return <g><rect x={x - 3} y={y - 3} width="58" height="61" rx="2" fill="#c7b99a"/><rect x={x} y={y} width="52" height="52" rx="3" fill="#d4ded4" stroke="#85988c" strokeWidth="1.4"/><path d={`M${x + 13} ${y}v52m13-52v52m13-52v52M${x} ${y + 13}h52m-52 13h52m-52 13h52`} stroke="#a7b7ab" strokeWidth="1.1"/><circle cx={x + 26} cy={y + 26} r="6" fill="#a5b5a8" stroke="#7e9788"/></g>; }

export default function FactoryMap({ onSelectEquipment, onSelectPoint, selectedEquipment, highlightedEquipment, snapshot = defaultSnapshot, showRoute = false, playing = false }: FactoryMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState(initialView);
  const [dragging, setDragging] = useState(false);
  const [viewport, setViewport] = useState({ width: 1200, height: 800 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; width: number; anchor: { x: number; y: number } } | null>(null);
  const suppressClickUntil = useRef(0);
  const unitsPerPixel = Math.max(view.w / viewport.width, view.h / viewport.height);
  // Keep camera controls legible and touchable even when the whole site fits a phone.
  const cameraScale = Math.min(6, Math.max(1, 16 / 17 * unitsPerPixel));
  const cameraHitRadius = Math.min(140, Math.max(24, 22 * unitsPerPixel));
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; scale: number } | null>(null);
  const zoom = (factor: number, anchor?: { x: number; y: number }) => setView(v => {
    const w = Math.max(400, Math.min(1500, v.w * factor));
    const ratio = w / v.w;
    const p = anchor ?? { x: v.x + v.w / 2, y: v.y + v.h / 2 };
    return { x: p.x - (p.x - v.x) * ratio, y: p.y - (p.y - v.y) * ratio, w, h: w * 2 / 3 };
  });
  const beginPointer = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const svg = e.currentTarget;
    if (pointers.current.size >= 2) {
      svg.setPointerCapture(e.pointerId);
      const [a, b] = [...pointers.current.values()];
      const matrix = svg.getScreenCTM();
      if (!matrix) return;
      const anchor = new DOMPoint((a.x + b.x) / 2, (a.y + b.y) / 2).matrixTransform(matrix.inverse());
      pinch.current = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), width: view.w, anchor };
      drag.current = null;
      suppressClickUntil.current = Date.now() + 500;
      setDragging(true);
      return;
    }
    if ((e.target as Element).closest('[role="button"]')) return;
    const box = svg.getBoundingClientRect();
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, scale: Math.min(box.width / view.w, box.height / view.h) };
    svg.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const movePointer = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pinch.current;
    if (p && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const w = Math.max(400, Math.min(1500, p.width * p.distance / distance));
      const h = w * 2 / 3;
      const box = e.currentTarget.getBoundingClientRect();
      const scale = Math.min(box.width / w, box.height / h);
      const px = (a.x + b.x) / 2 - box.left - (box.width - w * scale) / 2;
      const py = (a.y + b.y) / 2 - box.top;
      setView({ x: p.anchor.x - px / scale, y: p.anchor.y - py / scale, w, h });
      suppressClickUntil.current = Date.now() + 500;
      return;
    }
    const d = drag.current;
    if (d) setView(v => ({ ...v, x: d.vx - (e.clientX - d.x) / d.scale, y: d.vy - (e.clientY - d.y) / d.scale }));
  };
  const endPointer = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current) suppressClickUntil.current = Date.now() + 350;
    pinch.current = null;
    const remaining = [...pointers.current.values()][0];
    if (remaining) {
      const box = e.currentTarget.getBoundingClientRect();
      drag.current = { x: remaining.x, y: remaining.y, vx: view.x, vy: view.y, scale: Math.min(box.width / view.w, box.height / view.h) };
    } else {
      drag.current = null;
      setDragging(false);
    }
  };
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const box = svg.getBoundingClientRect();
      if (box.width > 100 && box.height > 100) setViewport({ width: box.width, height: box.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (event: WheelEvent) => {
      event.preventDefault();
      const matrix = svg.getScreenCTM();
      const anchor = matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : undefined;
      zoom(event.deltaY > 0 ? 1.12 : .89, anchor);
    };
    svg.addEventListener('wheel', handler, { passive: false });
    return () => svg.removeEventListener('wheel', handler);
  }, []);
  const select = (id: EquipmentId, name: string, bounds: [number, number, number, number], children: ReactNode) => <g role="button" tabIndex={0} aria-label={`Объект: ${name}`} className={`map-eq ${selectedEquipment === id || highlightedEquipment === id ? 'is-selected' : ''}`} onClick={e => { e.stopPropagation(); if (Date.now() >= suppressClickUntil.current) onSelectEquipment(id); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectEquipment(id); } }}>
    <rect className="selection-halo" x={bounds[0]} y={bounds[1]} width={bounds[2]} height={bounds[3]} rx="9" fill="#dce9df" fillOpacity=".38" stroke="#53806c" strokeWidth="2" strokeDasharray="5 4"/>
    {children}
  </g>;
  return <div className={`factory-map ${dragging ? 'dragging' : ''} ${playing ? '' : 'paused'}`}>
    
    <div className="map-north"><span>С</span><svg width="22" height="32" viewBox="0 0 22 32" aria-hidden="true"><path d="M11 2L4 23l7-5 7 5Z" fill="#52695b"/><path d="M11 2v16l7 5Z" fill="#bac8b9"/></svg></div>
    <svg ref={svgRef} preserveAspectRatio="xMidYMin meet" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} aria-label="Интерактивная карта участка приготовления технических масел. Семь точек осмотра и оборудование." onPointerDown={beginPointer} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer}>
      <defs>
        <pattern id="site-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#cdd5ca"/></pattern>
        <pattern id="indoor-floor" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="#d8dfd4" strokeWidth=".6"/></pattern>
        <pattern id="canopy-stripes" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M0 0V14" stroke="#bdc9be" strokeWidth="1"/></pattern>
        <pattern id="safety-hatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="#e6dfc3"/><rect width="5" height="12" fill="#c4b16e" fillOpacity=".35"/></pattern>
        <linearGradient id="metal"><stop stopColor="#c0ccc5"/><stop offset=".45" stopColor="#f0f4ee"/><stop offset="1" stopColor="#b4c2b9"/></linearGradient>
        <radialGradient id="tank-metal" cx=".35" cy=".28"><stop stopColor="#f1f5ee"/><stop offset=".7" stopColor="#d7e0d5"/><stop offset="1" stopColor="#b8c7ba"/></radialGradient>
        <filter id="equipment-shadow" x="-35%" y="-35%" width="180%" height="180%"><feDropShadow dx="3" dy="4" stdDeviation="2" floodColor="#50604e" floodOpacity=".13"/></filter>
        <marker id="flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0l10 5-10 5Z" fill="#bd944f"/></marker>
        <marker id="walk-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0l10 5-10 5Z" fill="#81988a"/></marker>
        <clipPath id="tank-a-clip"><circle cx="266" cy="346" r="42"/></clipPath><clipPath id="tank-b-clip"><circle cx="370" cy="346" r="42"/></clipPath>
      </defs>
      <rect x="-2000" y="-2000" width="5200" height="4800" fill="#edf0e9"/><rect width="1200" height="800" fill="url(#site-grid)"/>
      {/* Separate vehicle road on the west and south edges. */}
      <path d="M102 -30V747H865" fill="none" stroke="#d4dcd1" strokeWidth="150"/>
      <path d="M102 -30V747H865" fill="none" stroke="#e3e8df" strokeWidth="143"/>
      <path d="M102 190V448M102 550V704Q102 747 150 747H780" fill="none" stroke="#fcfdf8" strokeWidth="2" strokeDasharray="17 14"/>
      <path d="M85 205l17-13 17 13m-17-13v37M83 560l19 14 19-14m-19 14v-37M345 733l14 14-14 14m14-14h-37M770 733l14 14-14 14m14-14h-37" fill="none" stroke="#a7b5a4" strokeWidth="2"/>
      <rect x="185" y="205" width="1010" height="12" rx="5" fill="#dce4d6"/><path d="M191 211H1187" stroke="#ced8c8" strokeWidth="3" strokeDasharray="2 8"/>
      <text x="443" y="193" fontSize="9" fill="#8d9d8a" letterSpacing="2">НАРУЖНАЯ ТЕРРИТОРИЯ</text>
      {/* Walkway remains connected to the west door and all rooms. */}
      <path d="M190 460H410V510H590" fill="none" stroke="#e6e2c7" strokeWidth="28"/><path d="M190 460H410V510H590" fill="none" stroke="#f8f6e7" strokeWidth="22"/>
      <path d="M190 482H410V510H550" fill="none" stroke="#b7b294" strokeWidth="1" strokeDasharray="3 6"/>
      {/* Reception is flush to the north edge. */}
      {select('receiving', 'Приём автоцистерн', [49, -4, 306, 194], <>
        <path d="M58 0H339V178H58" fill="#cdd8cc" stroke="#a5b6a3" strokeWidth="2"/><rect x="65" width="268" height="170" fill="url(#canopy-stripes)"/>
        <path d="M64 0V174M333 0V174" stroke="#7f9583" strokeWidth="5"/><path d="M64 172H332" stroke="#a4b6a2" strokeWidth="2"/>
        {[65,330].map(x => <g key={x}><rect x={x - 5} y="7" width="10" height="10" fill="#778b76"/><rect x={x - 5} y="150" width="10" height="10" fill="#778b76"/></g>)}
        <rect x="158" y="8" width="65" height="150" rx="6" fill="#e3e8da" stroke="#c4b67c" strokeWidth="1.5" strokeDasharray="9 6"/><Truck x={171} y={9}/>
        <rect x="267" y="61" width="44" height="59" rx="4" fill="#dfe5d8" stroke="#9aab96"/><rect x="274" y="68" width="29" height="17" rx="2" fill="#789080"/><circle cx="288" cy="99" r="7" fill="#a2b29e" stroke="#748d77"/>
        <path d="M208 87H250V140H321" fill="none" stroke="#bb965a" strokeWidth="5"/><circle cx="251" cy="89" r="5" fill="#d9bd83" stroke="#aa864c"/>
        <rect x="72" y="142" width="69" height="20" rx="3" fill="#f8f9f0"/><text x="106" y="155" textAnchor="middle" fontSize="9" fontWeight="600" fill="#4d6554">ПРИЁМ</text>
        <circle cx="288" cy="135" r="3" fill={snapshot.receivingActive ? '#6a947b' : '#9aaa95'}/><text x="298" y="138" fontSize="8" fill="#627a62">{snapshot.receivingActive ? 'в работе' : 'пост свободен'}</text>
      </>)}
      <text x="190" y="194" textAnchor="middle" fontSize="11" fontWeight="600" fill="#50624f">01 · Приём автоцистерн</text>
      {/* The queue has parked vehicles only; it is not a pipe route. */}
      <path d="M41 238H165M41 403H165M41 238V403M165 238V403" fill="none" stroke="#c2cbbb" strokeWidth="1.4" strokeDasharray="9 6"/>
      {snapshot.queueLength > 0 ? <Truck x={61} y={252}/> : <g opacity=".35"><rect x="64" y="264" width="32" height="112" rx="5" fill="none" stroke="#93a28f" strokeDasharray="5 5"/><text x="140" y="323" textAnchor="middle" transform="rotate(-90 140 323)" fontSize="9" fill="#859680">МЕСТО ОЖИДАНИЯ</text></g>}
      {snapshot.queueLength > 1 && <Truck x={116} y={252} muted/>}
      <text x="101" y="425" textAnchor="middle" fontSize="10" fontWeight="600" fill="#74836d">Ожидание · {snapshot.queueLength}</text>
      {/* Two component tanks on a shared bund. */}
      {select('storage', 'Резервуары компонентов A и B', [208, 258, 219, 189], <>
        <rect x="211" y="263" width="212" height="180" rx="7" fill="#dde4d8" stroke="#bdcab6" strokeWidth="2"/><rect x="219" y="270" width="196" height="165" rx="3" fill="#e5eadf" stroke="#c9d4c3"/>
        <path d="M321 140H411V240H266V298M411 240H370V298" fill="none" stroke="#bda16e" strokeWidth="5" strokeLinejoin="round"/>
        <path d="M411 204v15M292 240h-16M370 266v17" fill="none" stroke="#b18e50" strokeWidth="2" markerEnd="url(#flow-arrow)"/>
        <path d="M266 392V419H451V386H482M370 392V435H466V407H482" fill="none" stroke="#c8a567" strokeWidth="5" strokeLinejoin="round"/>
        {[{x:266, name:'A', stock:snapshot.stockA,capacity:snapshot.capacityA,clip:'tank-a-clip'},{x:370,name:'B',stock:snapshot.stockB,capacity:snapshot.capacityB,clip:'tank-b-clip'}].map(t => <g key={t.name} filter="url(#equipment-shadow)">
          <circle cx={t.x} cy="346" r="50" fill="#b6c6b5" stroke="#91a68f" strokeWidth="1.5"/><circle cx={t.x} cy="346" r="44" fill="url(#tank-metal)" stroke="#a9bca7"/>
          <rect x={t.x-43} y={388 - 84 * Math.min(1,Math.max(0,t.stock/t.capacity))} width="86" height="84" clipPath={`url(#${t.clip})`} fill="#c7a15d" fillOpacity=".2"/>
          <circle cx={t.x} cy="346" r="37" fill="none" stroke="#b4c5ad" strokeWidth="1"/><path d={`M${t.x-31} 312l62 68`} stroke="#bccbb4" strokeWidth="1.5"/>
          <circle cx={t.x} cy="346" r="14" fill="#e8eee0" stroke="#a5b89d"/><text x={t.x} y="351" textAnchor="middle" fontSize="14" fontWeight="700" fill="#5e7554">{t.name}</text>
          <circle cx={t.x+25} cy="323" r="5" fill="#afc0a9" stroke="#8fa585"/>
          <path d={`M${t.x+43} 335v29m-6-26h11m-11 7h11m-11 7h11m-11 7h11`} stroke="#8fa482" strokeWidth="2"/>
          <rect x={t.x-41} y="398" width="82" height="21" rx="4" fill="#fafbf4" stroke="#d1dbc9"/><text x={t.x} y="412" textAnchor="middle" fontSize="10" fill="#63765a" fontWeight="600">{fmt(t.stock)} / {fmt(t.capacity)} м³</text>
        </g>)}
        <text x="317" y="287" textAnchor="middle" fontSize="9" fontWeight="600" fill="#718368" letterSpacing="1">КОМПОНЕНТЫ A / B</text>
      </>)}
      <text x="316" y="466" textAnchor="middle" fontSize="11" fontWeight="600" fill="#52654c">02 · Резервуарный парк</text>
      {/* Low production building, roof removed, doors open into shared circulation. */}
      <rect x="566" y="246" width="620" height="460" rx="3" fill="#9fab9a" fillOpacity=".12"/>
      <rect x="560" y="240" width="620" height="460" fill="#e9ede4" stroke="#a7b5a1" strokeWidth="8"/>
      <rect x="565" y="245" width="610" height="450" fill="url(#indoor-floor)"/>
      <rect x="570" y="250" width="287" height="242" fill="#dde6d8" fillOpacity=".6"/>
      <rect x="877" y="250" width="294" height="180" fill="#e8ede3"/>
      <rect x="570" y="540" width="287" height="146" fill="#e0e7d9" fillOpacity=".55"/>
      <rect x="878" y="451" width="293" height="235" fill="#e5e9df"/>
      <rect x="565" y="493" width="300" height="45" fill="#f3f0df"/>
      <rect x="856" y="429" width="319" height="22" fill="#f3f0df"/>
      <rect x="856" y="246" width="21" height="447" fill="#f3f0df"/>
      <path d="M560 484v53" stroke="#f3f0df" strokeWidth="10"/>
      <path d="M560 484h37a37 37 0 0 1-37 37" fill="none" stroke="#a6b59a" strokeWidth="1"/>
      <path d="M570 494H828M570 538H828M856 252V399M856 556V583M856 632V689M878 429H936M1001 429H1171M878 451H991M1060 451H1171" fill="none" stroke="#a6b49b" strokeWidth="5"/>
      <path d="M597 494v-35a35 35 0 0 1 35 35M832 538v35a35 35 0 0 0-35-35M937 429v-35a35 35 0 0 1 35 35M992 451v35a35 35 0 0 0 35-35" fill="none" stroke="#b4c0a7" strokeWidth="1"/>
      <path d="M560 479v-12m0 80v12" stroke="#6d8665" strokeWidth="6"/>
      <text x="870" y="225" fontSize="10" fill="#73876b" fontWeight="600" letterSpacing="2" textAnchor="middle">ПРОИЗВОДСТВЕННЫЙ КОРПУС</text>
      <text x="783" y="520" fontSize="8" fill="#9d9b7e" letterSpacing="1" textAnchor="middle">ПЕШЕХОДНЫЙ ПРОХОД</text>
      {/* Real pipe endpoints: pumps to mixer, mixer to filler. */}
      <path d="M486 386H542V348H677M486 407H552V365H677" fill="none" stroke="#c7a15f" strokeWidth="5" strokeLinejoin="round"/>
      <path d="M609 348h25M609 365h25" stroke="#b08a43" strokeWidth="2" markerEnd="url(#flow-arrow)"/>
      {(snapshot.mixingActive ?? snapshot.mixerActive) && <path className="map-flow" d="M489 386H542V348H677" fill="none" stroke="#e9cb8b" strokeWidth="2"/>}
      {select('pumps', 'Насосный узел', [436, 345, 87, 98], <>
        <rect x="443" y="350" width="76" height="87" rx="4" fill="#d2dcd0" stroke="#a0b29a"/>
        <path d="M450 358h62v70h-62Z" fill="url(#safety-hatch)" stroke="#bfc6ab"/>
        {[379,403].map(y => <g key={y} filter="url(#equipment-shadow)"><rect x="458" y={y-9} width="45" height="19" rx="4" fill="url(#metal)" stroke="#859e7e"/><circle cx="484" cy={y} r="10" fill="#71916c" stroke="#54794d"/><circle cx="484" cy={y} r="4" fill="#b4c3a9"/><path d={`M458 ${y-5}h13m-13 5h13m-13 5h13`} stroke="#99af90"/></g>)}
        <circle cx="507" cy="363" r="3" fill={snapshot.receivingTransferring ? '#6b9474' : '#99a88e'}/><path d="M477 369v-9h8" fill="none" stroke="#7e9674" strokeWidth="2"/>
      </>)}
      <text x="478" y="330" fontSize="10" fill="#637958" textAnchor="middle" fontWeight="600">03 · Насосы</text>
      {select('blending', 'Ёмкость смешивания', [599, 270, 241, 209], <>
        <text x="602" y="280" fontSize="10" fill="#708363" fontWeight="600">04 · Смешивание</text>
        <g filter="url(#equipment-shadow)"><rect x="665" y="300" width="125" height="126" rx="5" fill="#ccd7c6" stroke="#9aaf90"/><circle cx="728" cy="362" r="57" fill="url(#tank-metal)" stroke="#8fa386" strokeWidth="2"/><circle cx="728" cy="362" r="48" fill="none" stroke="#acbea1"/>
          <path d="M694 328l68 68m0-68-68 68" stroke="#b4c5aa" strokeWidth="2"/><circle cx="728" cy="362" r="19" fill="#aabb9e" stroke="#7e9b70" strokeWidth="2"/>
          <rect x="720" y="339" width="16" height="45" rx="4" fill="#6e8e62"/><path d="M718 352h20m-20 7h20m-20 7h20" stroke="#9fb193" strokeWidth="1.5"/><rect x="792" y="331" width="27" height="50" rx="3" fill="#e5ecdc" stroke="#8fa981"/><rect x="797" y="337" width="17" height="13" rx="2" fill="#6d8963"/><circle cx="802" cy="361" r="2" fill="#b9a25e"/><circle cx="809" cy="361" r="2" fill="#7f9c71"/>
        </g>
        <rect x="668" y="444" width="121" height="23" rx="5" fill="#f7f9ef" stroke="#cbd6c0"/><circle cx="680" cy="456" r="3" fill={snapshot.mixerActive ? '#729265' : '#a3af96'}/><text x="735" y="460" fontSize="9" textAnchor="middle" fill="#71835e">{snapshot.mixerActive ? 'Ёмкость занята' : 'Ёмкость свободна'}</text>
      </>)}
      {/* The sample uses a dashed route, rather than a bulk-oil pipe. */}
      <path d="M792 404H831V439H965V404" fill="none" stroke="#899b85" strokeWidth="1.5" strokeDasharray="4 5" markerEnd="url(#walk-arrow)"/>
      <rect x="902" y="433" width="24" height="12" rx="3" fill="#f3f0df"/><path d="M910 435v7h7v-7m-6-2h5" stroke="#7e9275" strokeWidth="1.2" fill="#d1c191"/>
      <text x="1049" y="442" fontSize="8" fill="#8a977c">ПЕРЕДАЧА ПРОБЫ</text>
      {select('quality', 'Лаборатория контроля качества', [882, 266, 276, 147], <>
        <text x="902" y="279" fontSize="10" fill="#708363" fontWeight="600">05 · Контроль качества</text>
        <path d="M928 304H1136V367H1106V333H928Z" fill="#cad7c1" stroke="#96ac89" strokeWidth="1.5"/>
        <rect x="955" y="309" width="42" height="20" rx="3" fill="#edf1e4" stroke="#a1b791"/><rect x="962" y="312" width="23" height="10" fill="#789469"/>
        <rect x="1011" y="306" width="37" height="25" rx="3" fill="#dfe7d5" stroke="#97ae86"/><circle cx="1029" cy="318" r="8" fill="#aec29b" stroke="#859f74"/>
        {[1060,1072,1084].map((x,i)=><g key={x}><rect x={x} y={314-i*2} width="7" height={13+i*2} rx="2" fill="#d6b97a" stroke="#a89769" strokeWidth=".8"/><rect x={x+1} y={311-i*2} width="5" height="4" rx="1" fill="#819276"/></g>)}
        <circle cx="976" cy="355" r="13" fill="#c3d1b8" stroke="#95ac84"/><circle cx="1052" cy="355" r="13" fill="#c3d1b8" stroke="#95ac84"/>
        <rect x="939" y="241" width="147" height="5" fill="#bdcead"/><path d="M975 240v7m36-7v7m36-7v7" stroke="#9eb589" strokeWidth="2"/>
        <rect x="1109" y="379" width="24" height="25" rx="2" fill="#d3ddc7" stroke="#a8bb98"/>
      </>)}
      {/* Filling feed crosses the circulation in an explicitly overhead span. */}
      <path d="M728 420V580" fill="none" stroke="#c5a15f" strokeWidth="6"/>
      <path d="M728 482v10q-14 7 0 16v29" fill="none" stroke="#f4f1de" strokeWidth="11"/><path d="M728 482v10q-14 7 0 16v29" fill="none" stroke="#bc9653" strokeWidth="5"/>
      <path d="M728 550v16" stroke="#aa8341" strokeWidth="2" markerEnd="url(#flow-arrow)"/>
      <path d="M711 488h-6v39h6m34-39h6v39h-6" fill="none" stroke="#9d9c7a" strokeWidth="1"/><text x="696" y="511" textAnchor="end" fontSize="7" fill="#8e8d72">НАД ПРОХОДОМ</text>
      {select('filling', 'Линия фасовки', [603, 551, 239, 126], <>
        <text x="602" y="560" fontSize="10" fill="#708363" fontWeight="600">06 · Фасовка</text>
        <rect x="646" y="582" width="168" height="48" rx="4" fill="#c1d0b7" stroke="#8fa67e" strokeWidth="1.5"/>
        <rect x="653" y="590" width="154" height="31" rx="3" fill="#e3e9d9" stroke="#a5b793"/>
        {Array.from({length:15},(_,i)=><path key={i} d={`M${657+i*10} 591v29`} stroke="#b3c2a4" strokeWidth="2"/>)}
        <path d="M717 581v-9h26v9m-13-1v12" fill="none" stroke="#7d9670" strokeWidth="3"/>
        <Drum x={674} y={593}/><Drum x={718} y={593}/><Drum x={763} y={593}/>
        <rect x="619" y="584" width="20" height="40" rx="3" fill="#dde5d2" stroke="#9ab089"/><rect x="623" y="590" width="12" height="10" rx="1" fill="#749166"/>
        <Drum x={640} y={643}/><Drum x={671} y={643}/><rect x="741" y="643" width="74" height="22" rx="4" fill="#f6f8ec" stroke="#c8d5bc"/><circle cx="753" cy="654" r="3" fill={snapshot.fillerActive ? '#729265' : '#a3af96'}/><text x="782" y="658" fontSize="9" fill="#748460" textAnchor="middle">{snapshot.fillerActive ? 'В работе' : 'Свободна'}</text>
      </>)}
      {/* Finished product is moved as packages, not through a pipeline. */}
      <path d="M856 583h31v-2M856 632h31v2" fill="none" stroke="#a6b49b" strokeWidth="2"/><path d="M814 607H929" fill="none" stroke="#94a48b" strokeWidth="2" strokeDasharray="4 5" markerEnd="url(#walk-arrow)"/><rect x="855" y="597" width="22" height="19" rx="2" fill="#e5e9d9" stroke="#a5b599"/><path d="M861 598v17m10-17v17m-15-11h20m-20 6h20" stroke="#a3b397" strokeWidth="1"/>
      {select('dispatch', 'Склад готовой продукции и отгрузка', [884, 468, 278, 214], <>
        <text x="902" y="476" fontSize="10" fill="#708363" fontWeight="600">07 · Готовая продукция</text>
        <Pallet x={925} y={499}/><Pallet x={998} y={499}/><Pallet x={1094} y={499}/>
        <Pallet x={925} y={576}/><Pallet x={1094} y={576}/>
        <path d="M906 492v144h82m99-144v144h76" fill="none" stroke="#d1c391" strokeWidth="2"/>
        <text x="1048" y="642" textAnchor="middle" fontSize="8" fill="#95a184">ПРОХОД К ВОРОТАМ</text>
      </>)}
      <path d="M972 700h130" stroke="#e9ede4" strokeWidth="11"/><rect x="958" y="693" width="20" height="13" fill="#69856b"/><rect x="1100" y="693" width="15" height="13" fill="#69856b"/><path d="M978 699h122" stroke="#8fa58a" strokeWidth="2" strokeDasharray="4 3"/>
      <path d="M1012 714h57l25 64h-108Z" fill="#e4e5d5" stroke="#c2c9b5" strokeWidth="1"/><path d="M1019 720h43m-48 12h53m-57 12h63" stroke="#bfc5ae" strokeWidth="2"/>
      <path d="M1041 676v45" stroke="#8a9c7e" strokeWidth="1.5" strokeDasharray="4 5" markerEnd="url(#walk-arrow)"/>
      <text x="1131" y="750" textAnchor="middle" fontSize="10" fontWeight="600" fill="#75846a">Отгрузка</text>
      <text x="1131" y="764" textAnchor="middle" fontSize="8" fill="#939e88">Южные ворота</text>
      {/* Optional guided route is deliberately thinner than the pipelines. */}
      {showRoute && <path d="M370 170L430 205 430 480 190 480 190 460M190 480H530V455M530 480V510H590M590 510H866V440H890V400M866 440V675H590M590 675V720H960V770" fill="none" stroke="#648573" strokeWidth="1.5" strokeDasharray="2 7" strokeLinecap="round" opacity=".65"/>}
      {TOUR_POINTS.map(point => <g key={point.id} id={`map-point-${point.id}`} className="map-point" role="button" tabIndex={0} aria-label={`${point.id}: ${point.title}. Открыть вид с уровня глаз, направление ${point.direction.toLowerCase()}.`} onClick={e=>{e.stopPropagation();if(Date.now()>=suppressClickUntil.current)onSelectPoint(point.id);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelectPoint(point.id);}}}>
        <path d={`M${point.x} ${point.y} l-23 -46 Q${point.x} ${point.y-59} ${point.x+23} ${point.y-46} Z`} transform={`rotate(${point.rotation} ${point.x} ${point.y})`} fill="#6f9980" fillOpacity=".15" stroke="#759980" strokeOpacity=".3" strokeWidth=".8"/>
        <circle className="camera-target" cx={point.x} cy={point.y} r={cameraHitRadius} fill="transparent"/><g transform={`translate(${point.x} ${point.y}) scale(${cameraScale}) translate(${-point.x} ${-point.y})`}><circle className="camera-halo" cx={point.x} cy={point.y} r="23" fill="none"/>
        <circle className="camera-core" cx={point.x} cy={point.y} r="17" fill="#fcfdf7" stroke="#6f8f75" strokeWidth="1.5" filter="url(#equipment-shadow)"/>
        <g className="camera-icon" transform={`translate(${point.x-9} ${point.y-7})`} fill="none" stroke="#52755e" strokeWidth="1.5" strokeLinejoin="round"><path d="M1 4h4l2-3h5l2 3h3v10H1Z"/><circle cx="9" cy="9" r="3"/></g>
        <rect x={point.x+22} y={point.y-9} width="31" height="18" rx="4" fill="#f5f8ee" fillOpacity=".94"/><text x={point.x+37} y={point.y+3.5} textAnchor="middle" fontSize="8" fill="#627e63" fontWeight="700">{point.id}</text></g>
      </g>)}
    </svg>
    
    <div className="map-controls"><button className="map-fit" title="Показать весь участок" aria-label="Показать весь участок" onClick={()=>setView(initialView)}><Crosshair size={15}/><span className="map-fit-label">Весь участок</span></button><div className="map-controls-group"><button aria-label="Уменьшить масштаб" title="Уменьшить масштаб" onClick={()=>zoom(1.2)}><Minus size={17}/></button><button aria-label="Увеличить масштаб" title="Увеличить масштаб" onClick={()=>zoom(1/1.2)}><Plus size={17}/></button></div></div>
  </div>;
}
