'use client';

import { useEffect, useRef, useState } from 'react';
import type { TwinResult } from '@/lib/twin/sim';
import { POIS, type PoiId } from '@/lib/twin/pois';
import type { TerminalScene, PinScreen } from './TerminalScene';
import './scene.css';

export interface PinStatus { text: string; tone?: 'ok' | 'busy' | 'warn' }

interface Props {
  result: TwinResult | null;
  clock: React.RefObject<{ t: number; speed: number }>;
  selected: PoiId | null;
  onSelect?: (id: PoiId) => void;
  statuses?: Partial<Record<PoiId, PinStatus>>;
  showPins?: boolean;
  interactive?: boolean;
  autoRotate?: boolean;
  className?: string;
  onReady?: (api: { reset: () => void }) => void;
}

export default function SceneView({ result, clock, selected, onSelect, statuses, showPins = true, interactive = true, autoRotate, className, onReady }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<TerminalScene | null>(null);
  const pinRefs = useRef<Partial<Record<PoiId, HTMLButtonElement | null>>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const el = host.current;
    if (!el) return;
    const canvas = document.createElement('canvas');
    if (!(canvas.getContext('webgl2') || canvas.getContext('webgl'))) {
      setFailed('Браузер не поддерживает WebGL — 3D-сцена недоступна. Остальные разделы работают.');
      return;
    }
    import('./TerminalScene').then(({ TerminalScene }) => {
      if (cancelled || !host.current) return;
      try {
        const coarse = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 760;
        const s = new TerminalScene(host.current, {
          quality: coarse ? 'low' : 'high',
          interactive,
          autoRotate,
          getTime: () => clock.current ?? { t: 0, speed: 60 },
          onPins: (pins: Record<PoiId, PinScreen>) => {
            for (const id of Object.keys(pins) as PoiId[]) {
              const b = pinRefs.current[id];
              if (!b) continue;
              const p = pins[id];
              b.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
              b.style.opacity = p.visible ? '' : '0';
            }
          }
        });
        sceneRef.current = s;
        setReady(true);
        onReady?.({ reset: () => s.resetView() });
      } catch (e) {
        setFailed('Не удалось запустить 3D-сцену на этом устройстве.');
        console.error(e);
      }
    });
    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (ready && result) sceneRef.current?.setTrace(result); }, [ready, result]);
  useEffect(() => { if (ready) sceneRef.current?.focus(selected); }, [selected, ready]);

  return (
    <div className={`scene ${className ?? ''}`}>
      <div ref={host} className="scene-canvas" />
      {!ready && !failed && <div className="scene-loading"><span className="spinner" />Строим 3D-модель базы…</div>}
      {failed && <div className="scene-loading">{failed}</div>}
      {showPins && ready && (
        <div className="pins" role="list" aria-label="Точки интереса 3D-тура">
          {POIS.map((p) => {
            const st = statuses?.[p.id];
            return (
              <button
                key={p.id}
                role="listitem"
                ref={(el) => { pinRefs.current[p.id] = el; }}
                className={`pin ${selected === p.id ? 'is-active' : ''} ${p.process === 'internal' ? 'is-internal' : p.process === 'shared' ? 'is-shared' : ''}`}
                onClick={() => onSelect?.(p.id)}
                aria-pressed={selected === p.id}
                aria-label={`${p.n}. ${p.title}${st ? `: ${st.text}` : ''}`}
              >
                <span className="pin-label">
                  <span className="pin-n">{p.n}</span>
                  <span className="pin-title">{p.title}</span>
                  {st && <span className={`pin-st tone-${st.tone ?? 'ok'}`}>{st.text}</span>}
                </span>
                <span className="pin-stem" />
                <span className="pin-dot" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
