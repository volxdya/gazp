'use client';

import { Pause, Play } from 'lucide-react';
import { fmtClock } from '@/lib/twin/sim';
import type { Tone } from '@/lib/twin/derive';

export function Kpi({ label, value, unit, sub, delta, good }: { label: string; value: string; unit?: string; sub?: React.ReactNode; delta?: string; good?: boolean | null }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value num">{value}{unit && <small>{unit}</small>}</span>
      {(delta || sub) && (
        <span className="kpi-sub">
          {delta && <b className={good == null ? '' : good ? 'up' : 'down'}>{delta}</b>}
          {sub}
        </span>
      )}
    </div>
  );
}

export function Panel({ title, sub, action, children, className = '', flush = false }: { title?: string; sub?: string; action?: React.ReactNode; children: React.ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <header className="panel-head">
          <div>
            {title && <h2>{title}</h2>}
            {sub && <p>{sub}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={flush ? 'panel-flush' : 'panel-body'}>{children}</div>
    </section>
  );
}

export function Status({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`status t-${tone}`}><i />{children}</span>;
}

export function Meter({ value, tone = 'ok', marker }: { value: number; tone?: 'ok' | 'warn' | 'bad' | 'int' | 'ext'; marker?: number }) {
  return (
    <span className={`meter m-${tone}`}>
      <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
      {marker != null && <em style={{ left: `${Math.max(0, Math.min(1, marker)) * 100}%` }} />}
    </span>
  );
}

const SPEEDS = [60, 240, 720];

export function SimClock({ time, end, playing, setPlaying, seek, speed, setSpeed, shiftEnd }: { time: number; end: number; playing: boolean; setPlaying: (v: boolean) => void; seek: (t: number) => void; speed: number; setSpeed: (v: number) => void; shiftEnd: number }) {
  return (
    <div className="clock">
      <button className="clock-play" onClick={() => { if (time >= end) seek(0); setPlaying(!playing); }} aria-label={playing ? 'Пауза' : 'Запустить'}>
        {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
      </button>
      <b className="num">{fmtClock(time)}</b>
      <input type="range" min={0} max={Math.ceil(end)} step={0.5} value={Math.min(time, end)} onChange={(e) => seek(Number(e.target.value))} aria-label={`Время смены 08:00–${fmtClock(shiftEnd)}`} style={{ '--fill': `${(Math.min(time, end) / end) * 100}%` } as React.CSSProperties} />
      <button className="clock-speed num" onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 60)} title="Скорость модели">×{speed}</button>
    </div>
  );
}
