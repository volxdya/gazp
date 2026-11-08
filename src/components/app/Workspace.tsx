'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Braces, GitCompareArrows, Lock, LogOut, ScrollText, Workflow, RotateCcw, X, Network } from 'lucide-react';
import { simulate, DEFAULT_PARAMS, type TwinParams, type TwinResult } from '@/lib/twin/sim';
import { SCENARIOS, scenarioById } from '@/lib/twin/scenarios';
import type { PoiId } from '@/lib/twin/pois';
import { ROLE_LABEL, can, type Role } from '@/lib/roles';
import { Logo } from '@/components/ui/Logo';
import TourView from './TourView';
import SchemeView from './SchemeView';
import ProcessView from './ProcessView';
import CompareView from './CompareView';
import JournalView from './JournalView';
import ApiView from './ApiView';
import { report } from './report';
import './app.css';

export type Tab = 'scheme' | 'tour' | 'process' | 'compare' | 'journal' | 'api';
export interface User { name: string; role: Role; email: string }

const STORAGE_KEY = 'twin.workspace.v3';

interface Snapshot { tab: Tab; params: TwinParams; draft: TwinParams; baselineId: string; time: number; selected: PoiId | null; savedAt: number }

function safeLoad(): Snapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch { return null; }
}

export default function Workspace({ user }: { user: User }) {
  const canRun = can.runTwin(user.role);
  const [tab, setTab] = useState<Tab>('tour');
  const [baselineId, setBaselineId] = useState('as-is');
  const [params, setParams] = useState<TwinParams>(SCENARIOS[3].params);
  const [draft, setDraft] = useState<TwinParams>(SCENARIOS[3].params);
  const [selected, setSelected] = useState<PoiId | null>(null);
  const [restored, setRestored] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [computeInfo, setComputeInfo] = useState<{ ms: number; source: 'server' | 'local' } | null>(null);
  const [busy, setBusy] = useState(false);

  // часы симуляции: время в ref (для 3D на каждом кадре), в state — с частотой 4 Гц для интерфейса
  const clock = useRef({ t: 0, speed: 120 });
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeedState] = useState(120);

  const result: TwinResult = useMemo(() => simulate(params), [params]);
  const baseline: TwinResult = useMemo(() => simulate(scenarioById(baselineId).params), [baselineId]);

  // восстановление прошлой сессии
  useEffect(() => {
    const s = safeLoad();
    if (s && Date.now() - s.savedAt < 1000 * 60 * 60 * 24 * 3) {
      setTab(canRun || s.tab === 'tour' || s.tab === 'scheme' || s.tab === 'process' || s.tab === 'compare' ? s.tab : 'tour');
      setParams({ ...DEFAULT_PARAMS, ...s.params }); setDraft({ ...DEFAULT_PARAMS, ...s.draft }); setBaselineId(s.baselineId);
      setSelected(s.selected); clock.current.t = s.time; setTime(s.time);
      setRestored(s.savedAt);
      setTimeout(() => setRestored(null), 7000);
      report('info', 'session.restore', `Восстановлена сессия от ${new Date(s.savedAt).toLocaleTimeString('ru-RU')}`);
    }
    const onErr = (e: ErrorEvent | PromiseRejectionEvent) => {
      const msg = 'message' in e ? e.message : String((e as PromiseRejectionEvent).reason);
      report('error', 'client.error', msg.slice(0, 280));
    };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onErr);
    return () => { window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onErr); };
  }, [canRun]);

  // автосохранение
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const snap: Snapshot = { tab, params, draft, baselineId, time: clock.current.t, selected, savedAt: Date.now() };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
      } catch { /* приватный режим — продолжаем без сохранения */ }
    }, 600);
    return () => clearTimeout(id);
  }, [tab, params, draft, baselineId, selected, time]);

  // анимационный цикл времени
  useEffect(() => {
    let raf = 0, last = performance.now(), acc = 0;
    const horizon = result.horizon + 3;
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (playing) {
        clock.current.t = Math.min(horizon, clock.current.t + dt * (clock.current.speed / 60));
        if (clock.current.t >= horizon) setPlaying(false);
      }
      acc += dt;
      if (acc > 0.25) { acc = 0; setTime(clock.current.t); }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, result.horizon]);

  const seek = useCallback((t: number) => { clock.current.t = t; setTime(t); }, []);
  const setSpeed = useCallback((s: number) => { clock.current.speed = s; setSpeedState(s); }, []);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4200); };

  const run = useCallback(async (next: TwinParams) => {
    setBusy(true);
    const t0 = performance.now();
    try {
      const res = await fetch('/api/v1/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ params: next }) });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { computeMs: number; params: TwinParams };
      setParams(data.params);
      setDraft(data.params);
      setComputeInfo({ ms: data.computeMs, source: 'server' });
    } catch {
      // устойчивость: если сервер недоступен, расчёт выполняется в браузере тем же ядром
      setParams(next);
      setComputeInfo({ ms: Math.round(performance.now() - t0), source: 'local' });
      flash('Сервер недоступен — расчёт выполнен локально тем же ядром модели');
    } finally {
      setBusy(false);
      seek(0);
      setPlaying(true);
    }
  }, [seek]);

  const applyPreset = (id: string) => {
    const p = scenarioById(id).params;
    setDraft(p);
    if (!canRun) { setParams(p); seek(0); setPlaying(true); }
  };

  const openPoi = (id: PoiId) => { setSelected(id); setTab('tour'); };

  const logout = async () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    window.location.href = '/login';
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode; allowed: boolean }[] = [
    { id: 'scheme', label: 'Схема участка', icon: <Network size={18} />, allowed: true },
    { id: 'tour', label: '3D-тур', icon: <Box size={18} />, allowed: true },
    { id: 'process', label: 'Процесс', icon: <Workflow size={18} />, allowed: true },
    { id: 'compare', label: 'Сравнение', icon: <GitCompareArrows size={18} />, allowed: true },
    { id: 'journal', label: 'Журнал', icon: <ScrollText size={18} />, allowed: can.readJournal(user.role) },
    { id: 'api', label: 'API', icon: <Braces size={18} />, allowed: can.runTwin(user.role) }
  ];

  return (
    <div className="ws">
      <header className="ws-top">
        <div className="ws-brand">
          <Logo compact />
          <div className="ws-title">
            <h1>Цифровой двойник <span>· Участок технических масел</span></h1>
            <span className="chip">Приём автоцистерн → резервуары → смешивание → фасовка · синтетические данные</span>
          </div>
        </div>
        <nav className="seg" aria-label="Разделы">
          {tabs.map((t) => (
            <button key={t.id} aria-label={t.label} className={tab === t.id ? 'on' : ''} onClick={() => t.allowed && setTab(t.id)} disabled={!t.allowed} title={t.allowed ? undefined : 'Недоступно для вашей роли'} aria-current={tab === t.id ? 'page' : undefined}>
              {t.allowed ? t.icon : <Lock size={15} />}<span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="ws-user">
          <div className="avatar" aria-hidden>{user.name.slice(0, 1)}</div>
          <div className="ws-user-meta"><b>{user.name}</b><span className={`role role-${user.role}`}>{ROLE_LABEL[user.role]}</span></div>
          <button className="icon-btn" onClick={logout} aria-label="Выйти"><LogOut size={17} /></button>
        </div>
      </header>

      {restored && (
        <div className="banner rise" role="status">
          <RotateCcw size={16} /> Восстановлена прошлая сессия от {new Date(restored).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}: сценарий, время и выбранная точка.
          <button onClick={() => setRestored(null)} aria-label="Скрыть"><X size={16} /></button>
        </div>
      )}

      <main className={`ws-main tab-${tab}`}>
        {tab === 'tour' && (
          <TourView
            user={user} canRun={canRun} result={result} baseline={baseline} baselineId={baselineId} setBaselineId={setBaselineId}
            draft={draft} setDraft={setDraft} onRun={() => run(draft)} applyPreset={applyPreset} busy={busy} computeInfo={computeInfo}
            clock={clock} time={time} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed} seek={seek}
            selected={selected} setSelected={setSelected} goProcess={() => setTab('process')}
          />
        )}
        {tab === 'scheme' && <SchemeView result={result} time={time} playing={playing} setPlaying={setPlaying} seek={seek} selected={selected} setSelected={setSelected} open3d={openPoi} />}
        {tab === 'process' && <ProcessView result={result} baseline={baseline} baselineName={scenarioById(baselineId).name} openPoi={openPoi} time={time} />}
        {tab === 'compare' && <CompareView current={result} canSave={canRun} onLoad={(p) => { setDraft(p); if (canRun) run(p); else { setParams(p); } setTab('tour'); }} />}
        {tab === 'journal' && can.readJournal(user.role) && <JournalView result={result} isAdmin={can.manageUsers(user.role)} />}
        {tab === 'api' && canRun && <ApiView />}
      </main>

      {toast && <div className="toast rise" role="alert">{toast}</div>}
    </div>
  );
}
