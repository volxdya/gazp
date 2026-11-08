'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Info, Lock, Maximize2, Pause, Play, Sparkles, X, Truck, Package, Cylinder, FlaskConical, Moon, Sun, Eye, Map as MapIcon, Clapperboard, Square, Move } from 'lucide-react';
import SceneView from '@/components/scene/SceneView';
import { Stepper, Switch } from '@/components/ui/Stepper';
import { fmtClock, RESOURCE_LABEL, type TwinParams, type TwinResult } from '@/lib/twin/sim';
import { SCENARIOS } from '@/lib/twin/scenarios';
import { POIS, STAGES, TOUR_ORDER, PROCESS_LABEL, type PoiId } from '@/lib/twin/pois';
import { compareRows, fmt, insight, liveAt, matchPreset, pinStatuses, rowTone } from '@/lib/twin/derive';
import type { User } from './Workspace';
import { report } from './report';

interface Props {
  user: User;
  canRun: boolean;
  result: TwinResult;
  baseline: TwinResult;
  baselineId: string;
  setBaselineId: (id: string) => void;
  draft: TwinParams;
  setDraft: (p: TwinParams) => void;
  onRun: () => void;
  applyPreset: (id: string) => void;
  busy: boolean;
  computeInfo: { ms: number; source: 'server' | 'local' } | null;
  clock: React.RefObject<{ t: number; speed: number }>;
  time: number;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  speed: number;
  setSpeed: (v: number) => void;
  seek: (t: number) => void;
  selected: PoiId | null;
  setSelected: (id: PoiId | null) => void;
  goProcess: () => void;
  goCompare: () => void;
}

const SPEEDS = [{ v: 60, l: '×60' }, { v: 240, l: '×240' }, { v: 720, l: '×720' }];

export default function TourView(p: Props) {
  const { result, baseline, draft, setDraft, canRun, time } = p;
  const live = useMemo(() => liveAt(result, time), [result, time]);
  const statuses = useMemo(() => pinStatuses(result, live), [result, live]);
  const rows = useMemo(() => compareRows(baseline, result), [baseline, result]);
  const ins = useMemo(() => insight(baseline, result), [baseline, result]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(result.params);
  const preset = matchPreset(draft);
  const poi = p.selected ? POIS.find((x) => x.id === p.selected)! : null;
  const idx = poi ? TOUR_ORDER.indexOf(poi.id) : -1;
  const go = (d: number) => {
    const next = TOUR_ORDER[(idx + d + TOUR_ORDER.length) % TOUR_ORDER.length];
    p.setSelected(next);
    report('info', 'tour.poi', `Просмотр точки «${POIS.find((x) => x.id === next)!.title}»`);
  };
  const res = poi?.resource ? result.resources.find((r) => r.id === poi.resource) : null;
  const end = result.horizon;

  const [eye, setEye] = useState(false);
  const [night, setNight] = useState(false);
  const [auto, setAuto] = useState<number | null>(null); // шаг автоэкскурсии
  const [summary, setSummary] = useState(false);
  const STEP_MS = 8500;

  // автоэкскурсия: камера сама проходит путь масла от цистерны до склада
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
      if (auto !== null) { setAuto(null); return; }
      if (eye) { setEye(false); return; }
      if (summary) setSummary(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [auto, eye, summary]);

  const startAuto = () => {
    setSummary(false);
    setEye(true);
    setAuto(0);
    if (!p.playing) p.setPlaying(true);
    report('info', 'tour.auto', 'Запущена автоэкскурсия по пути масла');
  };
  const stopAuto = () => setAuto(null);
  const toggleEye = () => {
    if (!eye && !p.selected) p.setSelected(TOUR_ORDER[0]);
    setEye(!eye);
    if (auto !== null && eye) setAuto(null);
  };

  return (
    <div className="tour">
      <section className={`tour-stage card ${night ? 'is-night' : ''} ${eye ? 'is-eye' : ''}`} aria-label="3D-тур по участку масел">
        <SceneView
          className="tour-scene"
          result={result}
          clock={p.clock}
          selected={p.selected}
          onSelect={(id) => { p.setSelected(id === p.selected ? null : id); if (id !== p.selected) report('info', 'tour.poi', `Просмотр точки «${POIS.find((x) => x.id === id)!.title}»`); }}
          statuses={statuses}
          eye={eye}
          night={night}
        />

        <div className="hud-top">
          <div className="kpis">
            <div className="kpi"><Truck size={16} /><b className="num">{live.onSite}</b><span>цистерн на базе</span></div>
            <div className="kpi"><Cylinder size={16} /><b className="num">{fmt.pct(live.levelA)}/{fmt.pct(live.levelB)}%</b><span>резервуары A/B</span></div>
            <div className="kpi"><FlaskConical size={16} /><b className="num">{live.batchesDone}/{result.params.batches}</b><span>партий готово</span></div>
            <div className="kpi kpi-hide-sm"><Package size={16} /><b className="num">{fmt.int(live.packed)}</b><span>бочек</span></div>
          </div>
          <div className="hud-actions">
            <div className="legend kpi-hide-sm"><span><i className="lg-ext" />приём</span><span><i className="lg-shared" />общее</span><span><i className="lg-int" />производство</span></div>
            <button className={`hud-btn ${eye ? 'on' : ''}`} onClick={toggleEye} aria-pressed={eye} title="Вид от первого лица">{eye ? <MapIcon size={16} /> : <Eye size={16} />}<span>{eye ? 'К карте' : 'От первого лица'}</span></button>
            <button className={`hud-btn ${night ? 'on night' : ''}`} onClick={() => setNight(!night)} aria-pressed={night} title="Ночной режим">{night ? <Sun size={16} /> : <Moon size={16} />}<span>{night ? 'День' : 'Ночь'}</span></button>
            {!eye && <button className="icon-btn" onClick={() => p.setSelected(null)} aria-label="Показать весь участок" title="Весь участок"><Maximize2 size={17} /></button>}
          </div>
        </div>

        {poi && (
          <article className={`poi-card rise ${auto !== null ? 'is-auto' : ''}`} key={poi.id} aria-live="polite">
            {auto !== null && <div className="auto-bar"><i style={{ animationDuration: `${STEP_MS}ms` }} /></div>}
            <header>
              <span className={`poi-n ${poi.process}`}>{poi.n}</span>
              <div>
                <span className="poi-kicker">{PROCESS_LABEL[poi.process]}</span>
                <h2>{poi.title}</h2>
              </div>
              <button className="icon-btn" onClick={() => p.setSelected(null)} aria-label="Закрыть карточку"><X size={16} /></button>
            </header>
            <p className="poi-about">{poi.about}</p>
            <div className="poi-metrics">
              <div><span>Статус сейчас</span><b>{statuses[poi.id].text}</b></div>
              {res && <div><span>Загрузка · {RESOURCE_LABEL[res.id].toLowerCase()}</span><b className="num">{fmt.pct(res.utilization)}%</b></div>}
              {res && <div><span>Среднее ожидание</span><b className="num">{fmt.min(res.avgWait)} мин</b></div>}
              {!res && <div><span>Этапы процесса</span><b>{poi.stages.map((s) => STAGES[s].title).join(', ')}</b></div>}
            </div>
            <div className="poi-case"><Sparkles size={16} /><div><b>Лучшая практика: {poi.practice.title}</b><span>{poi.practice.text}</span></div></div>
            <footer>
              <button className="btn btn-ghost btn-sm" onClick={() => go(-1)} aria-label="Предыдущая точка"><ChevronLeft size={16} /></button>
              <span className="num poi-step">{idx + 1} / {TOUR_ORDER.length}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => go(1)} aria-label="Следующая точка"><ChevronRight size={16} /></button>
              {auto !== null
                ? <button className="btn btn-ghost btn-sm poi-go" onClick={stopAuto}><Square size={13} fill="currentColor" /> Стоп</button>
                : <>
                    {!eye && <button className="btn btn-ghost btn-sm" onClick={toggleEye} title="Посмотреть от первого лица"><Eye size={15} /></button>}
                    <button className="btn btn-soft btn-sm poi-go" onClick={p.goProcess}>Этап в двойнике <ArrowRight size={15} /></button>
                  </>}
            </footer>
          </article>
        )}

        {!poi && !summary && (
          <div className="tour-start-row rise">
            <button className="tour-start" onClick={startAuto}>
              <span><Clapperboard size={15} /></span> Автоэкскурсия: путь масла
            </button>
            <button className="tour-start ghost" onClick={() => go(1)}>По шагам · {TOUR_ORDER.length}</button>
          </div>
        )}

        {eye && auto === null && (
          <div className="eye-hint rise"><Move size={14} /> Перетаскивайте, чтобы осмотреться · колесо — приближение · Esc — к карте</div>
        )}

        {summary && (
          <div className="summary-wrap" role="dialog" aria-label="Итог экскурсии">
            <article className="summary rise">
              <button className="icon-btn summary-x" onClick={() => setSummary(false)} aria-label="Закрыть"><X size={16} /></button>
              <span className="poi-kicker">Итог экскурсии</span>
              <h2>От автоцистерны до бочки</h2>
              <ol className="summary-chain">
                {['Цистерна', 'Приём', 'Резервуары', 'Подача', 'Смешивание', 'Контроль', 'Фасовка', 'Склад'].map((x, i) => <li key={x} className={i < 2 ? 'ext' : i === 2 ? 'shared' : 'int'}>{x}</li>)}
              </ol>
              <div className="summary-stats">
                {rows.filter((r) => ['turn', 'plan', 'margin'].includes(r.key)).map((r) => (
                  <div key={r.key} className={rowTone(r)}>
                    <span>{r.label}</span>
                    <b className="num">{r.format(r.b)}<small> {r.unit}</small></b>
                    <em className="num">было {r.format(r.a)}</em>
                  </div>
                ))}
              </div>
              <div className={`insight ${ins.tone}`}><Info size={20} /><div><b>{ins.title}</b><span>{ins.text}</span></div></div>
              <div className="summary-actions">
                <button className="btn btn-primary" onClick={p.goCompare}>Сравнить все сценарии <ArrowRight size={16} /></button>
                <button className="btn btn-ghost" onClick={startAuto}><Clapperboard size={16} /> Ещё раз</button>
              </div>
            </article>
          </div>
        )}

        <div className="timeline">
          <button className="play" onClick={() => { if (time >= end) p.seek(0); p.setPlaying(!p.playing); }} aria-label={p.playing ? 'Пауза' : 'Запустить'}>
            {p.playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
          <div className="clock num"><b>{fmtClock(time)}</b><span>смена 08:00–{fmtClock(result.params.shiftHours * 60)}</span></div>
          <input type="range" className="scrub" min={0} max={Math.ceil(end)} step={0.5} value={Math.min(time, end)} onChange={(e) => p.seek(Number(e.target.value))} aria-label="Время смены" style={{ '--fill': `${(Math.min(time, end) / end) * 100}%` } as React.CSSProperties} />
          <div className="speeds" role="group" aria-label="Скорость">
            {SPEEDS.map((s) => <button key={s.v} className={p.speed === s.v ? 'on' : ''} onClick={() => p.setSpeed(s.v)}>{s.l}</button>)}
          </div>
        </div>
      </section>

      <aside className="panel card" aria-label="Проверка сценария">
        <div className="panel-head">
          <h2>Проверка сценария</h2>
          <p>Меняйте параметры базы и сравнивайте с исходным вариантом</p>
        </div>
        <div className="panel-body">
          <div className="presets" role="group" aria-label="Готовые сценарии">
            {SCENARIOS.map((s) => (
              <button key={s.id} className={preset?.id === s.id ? 'on' : ''} onClick={() => p.applyPreset(s.id)} title={s.hypothesis}>{s.name}</button>
            ))}
          </div>

          {!canRun && <div className="locked"><Lock size={15} /> Роль «Экскурсант»: доступны готовые сценарии. Свои параметры — у диспетчера и руководителя.</div>}

          <div className="ctrl-group">Приём автоцистерн</div>
          <div className="ctrl">
            <span>Постов слива</span>
            <Stepper label="Постов слива" value={draft.bays} min={1} max={6} onChange={(v) => setDraft({ ...draft, bays: v })} disabled={!canRun} />
          </div>
          <div className="ctrl">
            <span>Цистерн в час</span>
            <Stepper label="Цистерн в час" value={draft.trucksPerHour} min={0.5} max={4} step={0.25} onChange={(v) => setDraft({ ...draft, trucksPerHour: v })} disabled={!canRun} format={(v) => String(v).replace('.', ',')} />
          </div>
          <label className="ctrl ctrl-sw">
            <span>Цифровой приём<small>предзапись, поточный анализатор, ЭТрН</small></span>
            <Switch label="Цифровой приём" checked={draft.automation && draft.prepMode === 'prebooked'} onChange={(v) => setDraft({ ...draft, automation: v, prepMode: v ? 'prebooked' : 'on-arrival' })} disabled={!canRun} />
          </label>
          <div className="ctrl-group">Производство</div>
          <div className="ctrl">
            <span>Смесителей</span>
            <Stepper label="Смесителей" value={draft.blenders} min={1} max={3} onChange={(v) => setDraft({ ...draft, blenders: v })} disabled={!canRun} />
          </div>
          <div className="ctrl">
            <span>Партий по плану</span>
            <Stepper label="Партий по плану" value={draft.batches} min={2} max={14} onChange={(v) => setDraft({ ...draft, batches: v })} disabled={!canRun} />
          </div>
          <div className="ctrl">
            <span>Линий фасовки</span>
            <Stepper label="Линий фасовки" value={draft.lines} min={1} max={2} onChange={(v) => setDraft({ ...draft, lines: v })} disabled={!canRun} />
          </div>

          {canRun && (
            <button className="btn btn-primary btn-lg btn-block calc" onClick={p.onRun} disabled={p.busy}>
              {p.busy ? <span className="spinner sm" /> : null}{dirty ? 'Рассчитать' : 'Пересчитать'}
            </button>
          )}

          <div className="ba">
            <div className="ba-head">
              <select value={p.baselineId} onChange={(e) => p.setBaselineId(e.target.value)} aria-label="Сценарий «Было»">
                {SCENARIOS.map((s) => <option key={s.id} value={s.id}>Было: {s.name}</option>)}
              </select>
              <ArrowRight size={16} />
              <b>Стало</b>
            </div>
            {rows.map((r) => {
              const tone = rowTone(r);
              return (
                <div className="ba-row" key={r.key}>
                  <span>{r.label}</span>
                  <span className="num ba-a">{r.format(r.a)}</span>
                  <ArrowRight size={14} className="ba-arrow" />
                  <b className={`num ba-b ${tone}`}>{r.format(r.b)} <small>{r.unit}</small></b>
                </div>
              );
            })}
          </div>

          <div className={`insight ${ins.tone}`}>
            <Info size={22} />
            <div><b>{ins.title}</b><span>{ins.text}</span></div>
          </div>
          <p className="foot">
            Событийная модель · {result.metrics.arrived} цистерн, {result.params.batches} партий · seed {result.params.seed}
            {p.computeInfo && <> · расчёт {p.computeInfo.ms} мс {p.computeInfo.source === 'server' ? 'на сервере' : 'в браузере'}</>}
          </p>
        </div>
      </aside>
    </div>
  );
}
