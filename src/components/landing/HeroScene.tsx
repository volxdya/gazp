'use client';

import { useEffect, useMemo, useRef } from 'react';
import SceneView from '@/components/scene/SceneView';
import { simulate } from '@/lib/twin/sim';
import { SCENARIOS } from '@/lib/twin/scenarios';

export default function HeroScene() {
  const result = useMemo(() => simulate({ ...SCENARIOS[0].params, trucksPerHour: 5 }), []);
  const clock = useRef({ t: 95, speed: 150 });
  useEffect(() => {
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      clock.current.t += dt * (clock.current.speed / 60);
      if (clock.current.t > result.horizon - 20) clock.current.t = 40;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [result]);
  return <SceneView className="hero-scene-inner" result={result} clock={clock} selected={null} showPins={false} interactive={false} autoRotate />;
}
