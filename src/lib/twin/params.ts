import { DEFAULT_PARAMS, type TwinParams } from './sim';

const LIMITS: Partial<Record<keyof TwinParams, [number, number]>> = {
  days: [1, 31], crudeT: [0, 2_000_000], plan92: [0, 1_000_000], plan95: [0, 1_000_000],
  tanks92: [1, 10], tanks95: [1, 10], tankT: [200, 20000], qcHours: [0.5, 24], supply: [0.3, 2],
  posts: [1, 12], truckT: [5, 40], loadRate: [20, 400], idleRate: [0, 20000], seed: [1, 1e6]
};

/** Приводит входные параметры к допустимым диапазонам: защита модели от некорректных и злонамеренных значений. */
export function sanitize(raw: Record<string, unknown>): TwinParams {
  const p: TwinParams = { ...DEFAULT_PARAMS };
  for (const [k, [lo, hi]] of Object.entries(LIMITS) as [keyof TwinParams, [number, number]][]) {
    const v = Number(raw[k]);
    if (Number.isFinite(v)) (p as unknown as Record<string, number>)[k] = Math.min(hi, Math.max(lo, v));
  }
  for (const k of ['days', 'tanks92', 'tanks95', 'posts', 'seed'] as const) p[k] = Math.round(p[k]);
  if (raw.profile === 'slots' || raw.profile === 'uneven') p.profile = raw.profile;
  return p;
}
