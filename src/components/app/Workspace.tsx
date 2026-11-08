'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Braces, ChartColumn, Factory, LayoutDashboard, LogOut, ScrollText, Truck } from 'lucide-react';
import { simulate, DEFAULT_PARAMS, type TwinParams, type TwinResult } from '@/lib/twin/sim';
import { SCENARIOS, scenarioById } from '@/lib/twin/scenarios';
import type { PoiId } from '@/lib/twin/pois';
import { matchPreset } from '@/lib/twin/derive';
import { ROLE_LABEL, can, type Role } from '@/lib/roles';
import { Logo } from '@/components/ui/Logo';
import { SimClock } from './ui';
import OverviewView from './OverviewView';
import ReceivingView from './ReceivingView';
import ProductionView from './ProductionView';
import AnalyticsView from './AnalyticsView';
import TourView from './TourView';
import JournalView from './JournalView';
import ApiView from './ApiView';
import { report } from './report';
import './app.css';

export type Tab = 'overview' | 'receiving' | 'production' | 'analytics' | 'tour' | 'journal' | 'api';
export interface User { name: string; role: Role; email: string }

const STORAGE_KEY = 'twin.workspace.v4';

interface Snapshot { tab: Tab; params: TwinParams; baselineId: string; time: number; savedAt: number }

const PAGES: Record<Tab, { title: string }> = {
  overview: { title: 'Главная' },
  receiving: { title: 'Приёмка' },
  production: { title: 'Производство' },
  analytics: { title: 'Аналитика' },
  tour: { title: '3D-тур' },
  journal: { title: 'Журнал' },
  api: { title: 'API' }
};

function safeLoad(): Snapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch { return null; }
}

export default function Workspace({ user }: { user: User }) {
  const canRun = can.runTwin(user.role);
  const [tab, setTab] = useState<Tab>('overview');
  const [baselineId, setBaselineId] = useState('as-is');
  const [params, setParams] = useState<TwinParams>(SCENARIOS[3].params);
  const [selected, setSelected] = useState<PoiId | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // часы симуляции: время в ref (для 3D на каждом кадре), в state — 4 раза в секунду для интерфейса
  const clock = useRef({ t: 0, speed: 240 });
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeedState] = useState(240);

  const result: TwinResult = useMemo(() => simulate(params), [params]);
  const baseline: TwinResult = useMemo(() => simulate(scenarioById(baselineId).params), [baselineId]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4000); };

  // восстановление прошлой сессии и сбор клиентских ошибок в журнал
  useEffect(() => {
    const s = safeLoad();
    if (s && Date.now() - s.savedAt < 1000 * 60 * 60 * 24 * 3) {
      const allowed = s.tab === 'journal' ? can.readJournal(user.role) : s.tab === 'api' ? canRun : true;
      setTab(allowed ? s.tab : 'overview');
      setParams({ ...DEFAULT_PARAMS, ...s.params });
      setBaselineId(s.baselineId);
      clock.current.t = s.time;
      setTime(s.time);
      flash('Сессия восстановлена');
      report('info', 'session.restore', `Восстановлена сессия от ${new Date(s.savedAt).toLocaleTimeString('ru-RU')}`);
    }
    const onErr = (e: ErrorEvent | PromiseRejectionEvent) => {
      const msg = 'message' in e ? e.message : String((e as PromiseRejectionEvent).reason);
      report('error', 'client.error', msg.slice(0, 280));
    };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onErr);
    return () => { window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onErr); };
  }, [canRun, user.role]);

  useEffect(() => {
    const id = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ tab, params, baselineId, time: clock.current.t, savedAt: Date.now() } satisfies Snapshot)); } catch { /* приватный режим */ }
    }, 600);
    return () => clearTimeout(id);
  }, [tab, params, baselineId, time]);

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

  /** Применить параметры: для ролей с правом моделирования расчёт идёт на сервере и пишется в журнал */
  const apply = useCallback(async (next: TwinParams) => {
    if (!canRun) { setParams(next); seek(0); setPlaying(true); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/v1/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ params: next }) });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { params: TwinParams };
      setParams(data.params);
    } catch {
      setParams(next);
      flash('Нет связи с сервером — посчитано локально');
    } finally {
      setBusy(false);
      seek(0);
      setPlaying(true);
    }
  }, [canRun, seek]);

  const openTour = (id: PoiId) => { setSelected(id); setTab('tour'); };

  const logout = async () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    window.location.href = '/login';
  };

  const main: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Главная', icon: <LayoutDashboard size={18} /> },
    { id: 'receiving', label: 'Приёмка', icon: <Truck size={18} /> },
    { id: 'production', label: 'Производство', icon: <Factory size={18} /> },
    { id: 'analytics', label: 'Аналитика', icon: <ChartColumn size={18} /> },
    { id: 'tour', label: '3D-тур', icon: <Box size={18} /> }
  ];
  const extra: { id: Tab; label: string; icon: React.ReactNode }[] = [
    ...(can.readJournal(user.role) ? [{ id: 'journal' as Tab, label: 'Журнал', icon: <ScrollText size={17} /> }] : []),
    ...(canRun ? [{ id: 'api' as Tab, label: 'API', icon: <Braces size={17} /> }] : [])
  ];
  const preset = matchPreset(params);
  const page = PAGES[tab];

  return (
    <div className="app">
      <aside className="side">
        <div className="side-logo"><Logo /></div>
        <nav className="side-nav" aria-label="Разделы">
          {main.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
              {t.icon}<span>{t.label}</span>
            </button>
          ))}
        </nav>
        {extra.length > 0 && (
          <nav className="side-nav side-extra" aria-label="Служебное">
            {extra.map((t) => (
              <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
                {t.icon}<span>{t.label}</span>
              </button>
            ))}
          </nav>
        )}
        <div className="side-user">
          <div className="avatar" aria-hidden>{user.name.slice(0, 1)}</div>
          <div className="side-user-meta"><b>{user.name}</b><span>{ROLE_LABEL[user.role]}</span></div>
          <button className="icon-btn" onClick={logout} aria-label="Выйти" title="Выйти"><LogOut size={16} /></button>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <div className="topbar-title"><h1>{page.title}</h1></div>
          <div className="topbar-tools">
            <label className="scenario-pick">
              <span>Сценарий</span>
              <select value={preset?.id ?? 'custom'} onChange={(e) => { const s = SCENARIOS.find((x) => x.id === e.target.value); if (s) apply(s.params); }} disabled={busy}>
                {SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                {!preset && <option value="custom">Свой сценарий</option>}
              </select>
            </label>
            <SimClock time={time} end={result.horizon} playing={playing} setPlaying={setPlaying} seek={seek} speed={speed} setSpeed={setSpeed} shiftEnd={result.params.shiftHours * 60} />
          </div>
        </header>

        <main className={`page page-${tab}`}>
          {tab === 'overview' && <OverviewView result={result} baseline={baseline} time={time} openTour={openTour} go={setTab} />}
          {tab === 'receiving' && <ReceivingView result={result} time={time} />}
          {tab === 'production' && <ProductionView result={result} time={time} />}
          {tab === 'analytics' && <AnalyticsView result={result} baseline={baseline} baselineId={baselineId} setBaselineId={setBaselineId} apply={apply} busy={busy} canRun={canRun} time={time} />}
          {tab === 'tour' && <TourView result={result} baseline={baseline} clock={clock} time={time} playing={playing} setPlaying={setPlaying} selected={selected} setSelected={setSelected} goAnalytics={() => setTab('analytics')} />}
          {tab === 'journal' && can.readJournal(user.role) && <JournalView result={result} isAdmin={can.manageUsers(user.role)} />}
          {tab === 'api' && canRun && <ApiView />}
        </main>
      </div>

      {toast && <div className="toast rise" role="status">{toast}</div>}
    </div>
  );
}
