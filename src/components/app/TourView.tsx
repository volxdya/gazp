'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Moon, Play, Square, Sun, X } from 'lucide-react';
import SceneView from '@/components/scene/SceneView';
import type { TwinResult } from '@/lib/twin/sim';
import { PHOTOS, POIS, TOUR_ORDER, type PoiId } from '@/lib/twin/pois';
import PoiModal from './PoiModal';
import { compareRows, fmt, liveAt, pinStatuses } from '@/lib/twin/derive';
import { report } from './report';

interface Props {
  result: TwinResult;
  baseline: TwinResult;
  clock: React.RefObject<{ t: number; speed: number }>;
  time: number;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  selected: PoiId | null;
  setSelected: (id: PoiId | null) => void;
  goAnalytics: () => void;
}

const STEP_MS = 8500;

export default function TourView(p: Props) {
  const { result, baseline, time } = p;
  const live = useMemo(() => liveAt(result, time), [result, time]);
  const statuses = useMemo(() => pinStatuses(result, live), [result, live]);
  const poi = p.selected ? POIS.find((x) => x.id === p.selected)! : null;
  const idx = poi ? TOUR_ORDER.indexOf(poi.id) : -1;
  const res = poi?.resource ? result.resources.find((r) => r.id === poi.resource) : null;

  const [eye, setEye] = useState(false);
  const [night, setNight] = useState(false);
  const [auto, setAuto] = useState<number | null>(null);
  const [summary, setSummary] = useState(false);
  const [zoom, setZoom] = useState<PoiId | null>(null);

  const go = (d: number) => {
    const next = TOUR_ORDER[(idx + d + TOUR_ORDER.length) % TOUR_ORDER.length];
    p.setSelected(next);
    report('info', 'tour.poi', `Просмотр точки «${POIS.find((x) => x.id === next)!.title}»`);
  };

  // автоэкскурсия: камера сама проходит путь бензина от установки до автоцистерны
  useEffect(() => {
    if (auto === null) return;
    p.setSelected(TOUR_ORDER[auto]);
    const id = setTimeout(() => {
      if (auto + 1 < TOUR_ORDER.length) setAuto(auto + 1);
      else { setAuto(null); setEye(false); p.setSelected(null); setSummary(true); report('info', 'tour.auto', 'Автоэкскурсия завершена'); }
    }, STEP_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (auto !== null) setAuto(null);
      else if (eye) setEye(false);
      else if (summary) setSummary(false);
      else if (p.selected) p.setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [auto, eye, summary, p]);

  const startAuto = () => {
    setSummary(false);
    setEye(true);
    setAuto(0);
    if (!p.playing) p.setPlaying(true);
    report('info', 'tour.auto', 'Запущена автоэкскурсия по пути бензина');
  };
  const setMode = (first: boolean) => {
    if (first && !p.selected) p.setSelected(TOUR_ORDER[0]);
    setEye(first);
    if (!first) setAuto(null);
  };

  const rows = compareRows(baseline, result).filter((r) => ['wait', 'blocked', 'plan'].includes(r.key));

  return (
    <section className={`tour ${night ? 'is-night' : ''}`} aria-label="3D-тур по участку">
      <SceneView
        className="tour-scene"
        result={result}
        clock={p.clock}
        selected={p.selected}
        onSelect={(id) => { p.setSelected(id === p.selected ? null : id); if (id !== p.selected) report('info', 'tour.poi', `Просмотр точки «${POIS.find((x) => x.id === id)!.title}»`); }}
        eye={eye}
        night={night}
      />

      <div className="tour-top">
        <div className="seg-mini" role="group" aria-label="Вид">
          <button className={!eye ? 'on' : ''} onClick={() => setMode(false)}>Сверху</button>
          <button className={eye ? 'on' : ''} onClick={() => setMode(true)}>От первого лица</button>
        </div>
        <button className="icon-btn" onClick={() => setNight(!night)} aria-pressed={night} title={night ? 'День' : 'Ночь'}>{night ? <Sun size={16} /> : <Moon size={16} />}</button>
      </div>

      {poi && (
        <article className="tour-card rise" key={poi.id}>
          {auto !== null && <div className="tour-progress"><i style={{ animationDuration: `${STEP_MS}ms` }} /></div>}
          <header>
            <span className="eyebrow num">{poi.n} / {TOUR_ORDER.length}</span>
            <button className="icon-btn" onClick={() => { setAuto(null); p.setSelected(null); }} aria-label="Закрыть"><X size={15} /></button>
          </header>
          {PHOTOS[poi.id] && (
            <button className="tour-photo" onClick={() => { setAuto(null); setZoom(poi.id); }} aria-label={`Фото: ${poi.title}`}>
              <img src={PHOTOS[poi.id]!.main} alt="" loading="lazy" />
            </button>
          )}
          <h2>{poi.title}</h2>
          <dl className="tour-facts">
            <div><dt>Сейчас</dt><dd>{statuses[poi.id].text}</dd></div>
            {res && <div><dt>Загрузка</dt><dd className="num">{fmt.pct(res.utilization)}%</dd></div>}
          </dl>
          <footer>
            <button className="icon-btn" onClick={() => go(-1)} aria-label="Предыдущая точка"><ChevronLeft size={16} /></button>
            <button className="icon-btn" onClick={() => go(1)} aria-label="Следующая точка"><ChevronRight size={16} /></button>
            {auto !== null && <button className="btn btn-ghost btn-sm" onClick={() => setAuto(null)}><Square size={11} fill="currentColor" /> Стоп</button>}
          </footer>
        </article>
      )}

      {!poi && !summary && (
        <div className="tour-start rise">
          <button className="btn btn-primary" onClick={startAuto}><Play size={14} fill="currentColor" /> Автоэкскурсия</button>
          <button className="btn btn-ghost" onClick={() => go(1)}>По шагам</button>
        </div>
      )}

      {eye && auto === null && <div className="tour-hint">Перетащите, чтобы осмотреться</div>}

      {zoom && <PoiModal id={zoom} result={result} time={time} clock={p.clock} onClose={() => setZoom(null)} onNav={(id) => { setZoom(id); p.setSelected(id); }} allow3d={false} />}

      {summary && (
        <div className="tour-summary" role="dialog" aria-label="Итог экскурсии">
          <article className="rise">
            <button className="icon-btn" onClick={() => setSummary(false)} aria-label="Закрыть"><X size={15} /></button>
            <h2>Итог</h2>
            <div className="sum-stats">
              {rows.map((r) => (
                <div key={r.key}>
                  <span>{r.label}</span>
                  <b className="num">{r.format(r.b)} <small>{r.unit}</small></b>
                  <em className="num">было {r.format(r.a)}</em>
                </div>
              ))}
            </div>
            <div className="sum-actions">
              <button className="btn btn-primary" onClick={p.goAnalytics}>Сценарии <ArrowRight size={15} /></button>
              <button className="btn btn-ghost" onClick={startAuto}>Ещё раз</button>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
