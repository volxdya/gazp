import { DEFAULT_PARAMS, type TwinParams } from './sim';

const LIMITS: Partial<Record<keyof TwinParams, [number, number]>> = {
  shiftHours: [1, 24], trucksPerHour: [0.5, 20], gates: [1, 3], scales: [1, 3], bays: [1, 8], pumpRate: [30, 240],
  truckVolume: [8, 40], docCheckMin: [1, 30], labMin: [5, 90], batchEvery: [1, 30], dispatchers: [1, 4],
  lines: [1, 3], blenders: [1, 3], batches: [0, 16], batchM3: [2, 60], shareA: [0, 1], blendMin: [5, 180], fillRate: [1, 80], canisterL: [5, 1000],
  inLabMin: [2, 90], tankCapacity: [20, 1000], initialLevel: [0, 1], marginM3: [0, 100000],
  costIdleHour: [0, 20000], costBayShift: [0, 100000], seed: [1, 1e6]
};

/** Приводит входные параметры к допустимым диапазонам: защита модели от некорректных и злонамеренных значений. */
export function sanitize(raw: Record<string, unknown>): TwinParams {
  const p: TwinParams = { ...DEFAULT_PARAMS };
  for (const [k, [lo, hi]] of Object.entries(LIMITS) as [keyof TwinParams, [number, number]][]) {
    const v = Number(raw[k]);
    if (Number.isFinite(v)) (p as unknown as Record<string, number>)[k] = Math.min(hi, Math.max(lo, v));
  }
  for (const k of ['gates', 'scales', 'bays', 'batchEvery', 'dispatchers', 'seed', 'lines', 'blenders', 'batches'] as const) p[k] = Math.round(p[k]);
  if (raw.prepMode === 'prebooked' || raw.prepMode === 'on-arrival') p.prepMode = raw.prepMode;
  if (typeof raw.automation === 'boolean') p.automation = raw.automation;
  if (typeof raw.dedicatedPump === 'boolean') p.dedicatedPump = raw.dedicatedPump;
  return p;
}

