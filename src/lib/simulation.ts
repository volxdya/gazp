/** Deterministic event model. Time is in minutes, material is in litres. */
export type Component = 'A' | 'B';
export type ResourceId = 'receiving' | 'mixing' | 'quality' | 'filling';

export interface Parameters {
  shiftMinutes: number;
  arrivalInterval: number;
  deliveryVolume: number;
  /** Repeated schedule, for example AB, AAB or BBA. First arrival is at t = 0. */
  deliveryPattern: string;
  receivingRate: number;
  viscosityA: number;
  viscosityB: number;
  capacityA: number;
  capacityB: number;
  initialA: number;
  initialB: number;
  batchVolume: number;
  /** Volume fraction of component B, between 0 and 1. */
  fractionB: number;
  mixingMinutes: number;
  qualityMinutes: number;
  fillingRate: number;
  preparationMinutes: number;
  finishingMinutes: number;
}

export const DEFAULT_PARAMETERS: Parameters = {
  shiftMinutes: 480,
  arrivalInterval: 45,
  deliveryVolume: 12_000,
  deliveryPattern: 'AB',
  receivingRate: 600,
  viscosityA: 100,
  viscosityB: 40,
  capacityA: 80_000,
  capacityB: 80_000,
  initialA: 30_000,
  initialB: 30_000,
  batchVolume: 6_000,
  fractionB: 0.3,
  mixingMinutes: 15,
  qualityMinutes: 10,
  fillingRate: 200,
  preparationMinutes: 5,
  finishingMinutes: 3,
};

export const DEMO_COSTS = {
  componentA: 80,
  componentB: 120,
  mixingPerMinute: 6,
  qualityPerMinute: 10,
  fillingPerMinute: 8,
} as const;

export type TruckStage = 'preparation' | 'transfer' | 'blocked' | 'finishing' | 'waiting' | 'done';
export interface Truck {
  id: number;
  component: Component;
  volume: number;
  arrivedAt: number;
  startedAt?: number;
  completedAt?: number;
  transferred: number;
  stage: TruckStage;
  stageStartedAt: number;
  endsAt: number | null;
}

export type BatchStage = 'mixing' | 'quality' | 'waiting-filling' | 'filling' | 'done';
export interface Batch {
  id: number;
  volume: number;
  componentA: number;
  componentB: number;
  startedAt: number;
  stage: BatchStage;
  stageStartedAt: number;
  endsAt: number | null;
  completedAt?: number;
  /** Occupancy of the single blending vessel, including QC and downstream waits. */
  mixerMinutes?: number;
  /** Demonstration cost of this completed batch, in roubles. */
  cost?: number;
}

export interface ResourceState {
  busyMinutes: number;
  utilization: number;
  state: string;
  reason: string | null;
}

export interface ModelEvent {
  time: number;
  process: ResourceId;
  message: string;
}

export interface SimulationSnapshot {
  parameters: Parameters;
  time: number;
  stocks: Record<Component, number>;
  received: Record<Component, number>;
  queue: Truck[];
  activeTruck: Truck | null;
  mixer: Batch | null;
  filler: Batch | null;
  completedTrucks: Truck[];
  completedBatches: Batch[];
  resources: Record<ResourceId, ResourceState>;
  blockedReason: string | null;
  events: ModelEvent[];
}

export interface SimulationResults {
  completedTrucks: number;
  queueAtEnd: number;
  averageWaitMinutes: number;
  readyVolume: number;
  completedBatches: number;
  unfinishedBatches: number;
  averageBatchMinutes: number;
  totalCost: number;
  costPerLiter: number;
  utilization: Record<ResourceId, number>;
}

const EPS = 1e-8;
const VISCOSITY_TABLE = [[40, 1], [100, 0.8], [200, 0.6], [300, 0.45]] as const;

/** A synthetic monotone demonstration curve, NOT a real pump characteristic. */
export function viscosityFactor(viscosity: number): number {
  if (!Number.isFinite(viscosity) || viscosity < 40 || viscosity > 300) {
    throw new RangeError('Вязкость должна быть в диапазоне 40–300 сСт.');
  }
  for (let index = 1; index < VISCOSITY_TABLE.length; index += 1) {
    const [right, rightFactor] = VISCOSITY_TABLE[index];
    const [left, leftFactor] = VISCOSITY_TABLE[index - 1];
    if (viscosity <= right) {
      return leftFactor + (rightFactor - leftFactor) * (viscosity - left) / (right - left);
    }
  }
  return 0.45;
}

export function transferTime(volume: number, nominalRate: number, viscosity = 40): number {
  if (!Number.isFinite(volume) || volume < 0 || !Number.isFinite(nominalRate) || nominalRate <= 0) {
    throw new RangeError('Объём должен быть неотрицательным, расход — положительным.');
  }
  return volume / (nominalRate * viscosityFactor(viscosity));
}

export function validateParameters(p: Parameters): string[] {
  const errors: string[] = [];
  // Enforce the actual prototype input ranges here, not only HTML min/max.
  // This bounds synchronous work even when values come from edited browser storage.
  const ranges: [keyof Parameters, string, number, number][] = [
    ['shiftMinutes', 'Длительность смены, мин', 30, 1440],
    ['arrivalInterval', 'Интервал прибытия, мин', 1, 480],
    ['deliveryVolume', 'Объём поставки, л', 100, 200_000],
    ['receivingRate', 'Расход приёмного насоса, л/мин', 1, 10_000],
    ['capacityA', 'Вместимость резервуара A, л', 100, 1_000_000],
    ['capacityB', 'Вместимость резервуара B, л', 100, 1_000_000],
    ['initialA', 'Начальный остаток A, л', 0, 1_000_000],
    ['initialB', 'Начальный остаток B, л', 0, 1_000_000],
    ['batchVolume', 'Размер партии, л', 100, 200_000],
    ['mixingMinutes', 'Смешивание, мин', 1, 480],
    ['qualityMinutes', 'Проверка качества, мин', 1, 480],
    ['fillingRate', 'Фасовка, л/мин', 1, 10_000],
    ['preparationMinutes', 'Подготовка автоцистерны, мин', 0, 120],
    ['finishingMinutes', 'Завершение разгрузки, мин', 0, 120],
  ];
  for (const [field, label, minimum, maximum] of ranges) {
    const value = p[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
      errors.push(`${label}: допустимо от ${minimum.toLocaleString('ru-RU')} до ${maximum.toLocaleString('ru-RU')}.`);
    }
  }
  if (p.initialA > p.capacityA || p.initialB > p.capacityB) errors.push('Начальный остаток превышает вместимость резервуара.');
  if (!Number.isFinite(p.fractionB) || p.fractionB < 0 || p.fractionB > 1) errors.push('Доля B должна быть от 0 до 100%.');
  if (!Number.isFinite(p.viscosityA) || p.viscosityA < 40 || p.viscosityA > 300 || !Number.isFinite(p.viscosityB) || p.viscosityB < 40 || p.viscosityB > 300) {
    errors.push('Вязкость A и B должна быть в диапазоне 40–300 сСт.');
  }
  if (typeof p.deliveryPattern !== 'string' || !/^[AB]{1,40}$/.test(p.deliveryPattern)) errors.push('Расписание задаётся последовательностью A/B, например AB или AAB.');
  return errors;
}

function emptyResource(): ResourceState {
  return { busyMinutes: 0, utilization: 0, state: 'ожидание', reason: null };
}

/**
 * Pure event simulation from a fresh initial state to an absolute model time.
 * Rendering cadence and playback speed never enter the calculation.
 */
export function simulate(parameters: Parameters, untilMinutes = parameters.shiftMinutes): SimulationSnapshot {
  const errors = validateParameters(parameters);
  if (errors.length) throw new RangeError(errors.join(' '));
  if (!Number.isFinite(untilMinutes)) throw new RangeError('Модельное время должно быть конечным числом.');
  const p = { ...parameters };
  const horizon = Math.max(0, Math.min(untilMinutes, p.shiftMinutes));
  const s: SimulationSnapshot = {
    parameters: p, time: 0,
    stocks: { A: p.initialA, B: p.initialB }, received: { A: 0, B: 0 },
    queue: [], activeTruck: null, mixer: null, filler: null,
    completedTrucks: [], completedBatches: [],
    resources: { receiving: emptyResource(), mixing: emptyResource(), quality: emptyResource(), filling: emptyResource() },
    blockedReason: null, events: [],
  };
  let arrivalIndex = 0;
  let batchIndex = 0;
  const requiredA = p.batchVolume * (1 - p.fractionB);
  const requiredB = p.batchVolume * p.fractionB;
  const capacity = { A: p.capacityA, B: p.capacityB };
  const rate = { A: p.receivingRate * viscosityFactor(p.viscosityA), B: p.receivingRate * viscosityFactor(p.viscosityB) };

  function event(process: ResourceId, message: string) {
    s.events.push({ time: s.time, process, message });
    if (s.events.length > 80) s.events.shift();
  }

  function setTruckStage(truck: Truck, stage: TruckStage, duration?: number) {
    truck.stage = stage;
    truck.stageStartedAt = s.time;
    truck.endsAt = duration === undefined ? null : s.time + duration;
  }

  /** Resolve simultaneous events and zero-time resource handoffs before advancing. */
  function settle() {
    let changed = true;
    let iterations = 0;
    while (changed) {
      if (++iterations > 40) throw new Error('Ошибка модели: цикл передачи ресурсов.');
      changed = false;
      while (arrivalIndex * p.arrivalInterval <= s.time + EPS && arrivalIndex * p.arrivalInterval < p.shiftMinutes - EPS) {
        const component = p.deliveryPattern[arrivalIndex % p.deliveryPattern.length] as Component;
        s.queue.push({ id: arrivalIndex + 1, component, volume: p.deliveryVolume, arrivedAt: arrivalIndex * p.arrivalInterval, transferred: 0, stage: 'waiting', stageStartedAt: s.time, endsAt: null });
        arrivalIndex += 1;
        event('receiving', `Прибыла автоцистерна №${arrivalIndex}, компонент ${component}`);
        changed = true;
      }

      if (s.filler && (s.filler.endsAt ?? Infinity) <= s.time + EPS) {
        const batch = s.filler;
        batch.stage = 'done'; batch.completedAt = s.time; batch.endsAt = null;
        batch.cost = batch.componentA * DEMO_COSTS.componentA + batch.componentB * DEMO_COSTS.componentB
          + (batch.mixerMinutes ?? 0) * DEMO_COSTS.mixingPerMinute
          + p.qualityMinutes * DEMO_COSTS.qualityPerMinute
          + batch.volume / p.fillingRate * DEMO_COSTS.fillingPerMinute;
        s.completedBatches.push(batch); s.filler = null;
        event('filling', `Партия №${batch.id} готова: ${batch.volume.toLocaleString('ru-RU')} л`);
        changed = true;
      }

      if (s.mixer?.stage === 'mixing' && (s.mixer.endsAt ?? Infinity) <= s.time + EPS) {
        s.mixer.stage = 'quality'; s.mixer.stageStartedAt = s.time; s.mixer.endsAt = s.time + p.qualityMinutes;
        event('quality', `Проба партии №${s.mixer.id} передана в лабораторию`); changed = true;
      }
      if (s.mixer?.stage === 'quality' && (s.mixer.endsAt ?? Infinity) <= s.time + EPS) {
        s.mixer.stage = 'waiting-filling'; s.mixer.stageStartedAt = s.time; s.mixer.endsAt = null;
        event('quality', `Партия №${s.mixer.id}: контроль пройден`); changed = true;
      }
      if (s.mixer?.stage === 'waiting-filling' && !s.filler) {
        s.filler = s.mixer; s.mixer = null;
        s.filler.mixerMinutes = s.time - s.filler.startedAt;
        s.filler.stage = 'filling'; s.filler.stageStartedAt = s.time; s.filler.endsAt = s.time + s.filler.volume / p.fillingRate;
        event('filling', `Началась фасовка партии №${s.filler.id}`); changed = true;
      }

      const truck = s.activeTruck;
      if (truck?.stage === 'preparation' && (truck.endsAt ?? Infinity) <= s.time + EPS) {
        setTruckStage(truck, 'transfer'); event('receiving', `Перекачка компонента ${truck.component} из автоцистерны №${truck.id}`); changed = true;
      }
      if (truck?.stage === 'transfer') {
        if (truck.volume - truck.transferred <= EPS) {
          setTruckStage(truck, 'finishing', p.finishingMinutes); changed = true;
        } else if (capacity[truck.component] - s.stocks[truck.component] <= EPS) {
          setTruckStage(truck, 'blocked'); event('receiving', `Резервуар ${truck.component} заполнен: перекачка приостановлена`); changed = true;
        }
      }
      if (truck?.stage === 'blocked' && capacity[truck.component] - s.stocks[truck.component] > EPS) {
        setTruckStage(truck, 'transfer'); changed = true;
      }
      if (truck?.stage === 'finishing' && (truck.endsAt ?? Infinity) <= s.time + EPS) {
        setTruckStage(truck, 'done'); truck.completedAt = s.time;
        s.completedTrucks.push(truck); s.activeTruck = null;
        event('receiving', `Автоцистерна №${truck.id} обслужена и покинула пост`); changed = true;
      }
      if (!s.activeTruck && s.queue.length && s.time < p.shiftMinutes - EPS) {
        s.activeTruck = s.queue.shift()!; s.activeTruck.startedAt = s.time;
        setTruckStage(s.activeTruck, 'preparation', p.preparationMinutes); changed = true;
      }
      if (!s.mixer && s.stocks.A + EPS >= requiredA && s.stocks.B + EPS >= requiredB && s.time < p.shiftMinutes - EPS) {
        // The sole point of component reservation/consumption. Never debit twice.
        s.stocks.A = Math.max(0, s.stocks.A - requiredA); s.stocks.B = Math.max(0, s.stocks.B - requiredB);
        s.mixer = { id: ++batchIndex, volume: p.batchVolume, componentA: requiredA, componentB: requiredB, startedAt: s.time, stage: 'mixing', stageStartedAt: s.time, endsAt: s.time + p.mixingMinutes };
        event('mixing', `Смешивание партии №${batchIndex}: A ${Math.round(requiredA)} л + B ${Math.round(requiredB)} л`); changed = true;
      }
    }
  }

  settle();
  let steps = 0;
  while (s.time < horizon - EPS) {
    if (++steps > 300_000) throw new Error('Слишком большой сценарий для локального прототипа.');
    let nextTime = horizon;
    const nextArrival = arrivalIndex * p.arrivalInterval;
    if (nextArrival < p.shiftMinutes - EPS) nextTime = Math.min(nextTime, nextArrival);
    if (s.activeTruck?.endsAt !== null && s.activeTruck?.endsAt !== undefined) nextTime = Math.min(nextTime, s.activeTruck.endsAt);
    if (s.mixer?.endsAt !== null && s.mixer?.endsAt !== undefined) nextTime = Math.min(nextTime, s.mixer.endsAt);
    if (s.filler?.endsAt !== null && s.filler?.endsAt !== undefined) nextTime = Math.min(nextTime, s.filler.endsAt);
    let transferBoundary: { time: number; amount: number } | null = null;
    if (s.activeTruck?.stage === 'transfer') {
      const truck = s.activeTruck;
      const remaining = truck.volume - truck.transferred;
      const freeSpace = capacity[truck.component] - s.stocks[truck.component];
      const amount = Math.min(remaining, freeSpace);
      transferBoundary = { time: s.time + amount / rate[truck.component], amount };
      nextTime = Math.min(nextTime, transferBoundary.time);
    }
    const dt = nextTime - s.time;
    if (dt <= 0) throw new Error('Ошибка модели: время не продвигается.');
    if (s.activeTruck) s.resources.receiving.busyMinutes += dt;
    if (s.mixer) s.resources.mixing.busyMinutes += dt;
    if (s.mixer?.stage === 'quality') s.resources.quality.busyMinutes += dt;
    if (s.filler) s.resources.filling.busyMinutes += dt;
    if (s.activeTruck?.stage === 'transfer') {
      const truck = s.activeTruck;
      // At a physical transfer boundary, use the exact known volume. Computing it
      // as dt*rate can leave a floating-point residue whose event time rounds to now.
      const amount = Math.min(truck.volume - truck.transferred, capacity[truck.component] - s.stocks[truck.component],
        transferBoundary?.time === nextTime ? transferBoundary.amount : dt * rate[truck.component]);
      truck.transferred += amount; s.stocks[truck.component] += amount; s.received[truck.component] += amount;
    }
    s.time = nextTime;
    settle();
  }
  // Preserve the exact requested clock even when it is within numerical epsilon of an event.
  s.time = horizon;
  for (const resource of Object.values(s.resources)) resource.utilization = horizon > 0 ? Math.min(1, resource.busyMinutes / horizon) : 0;
  const truckLabels: Record<TruckStage, string> = { preparation: 'подготовка', transfer: 'перекачка', blocked: 'ожидание', finishing: 'завершение', waiting: 'ожидание', done: 'готово' };
  if (s.activeTruck) {
    s.resources.receiving.state = truckLabels[s.activeTruck.stage];
    s.resources.receiving.reason = s.activeTruck.stage === 'blocked' ? `резервуар ${s.activeTruck.component} заполнен` : null;
  }
  if (s.mixer) {
    const labels: Record<BatchStage, string> = { mixing: 'смешивание', quality: 'проверка', 'waiting-filling': 'ожидание', filling: 'фасовка', done: 'готово' };
    s.resources.mixing.state = labels[s.mixer.stage];
    s.resources.mixing.reason = s.mixer.stage === 'waiting-filling' ? 'занята фасовка; партия остаётся в смесителе' : s.mixer.stage === 'quality' ? 'ожидание результата проверки; ёмкость занята' : null;
  } else if (horizon < p.shiftMinutes) {
    s.resources.mixing.reason = s.stocks.A + EPS < requiredA ? 'нет компонента A' : s.stocks.B + EPS < requiredB ? 'нет компонента B' : null;
  }
  s.resources.quality.state = s.mixer?.stage === 'quality' ? 'проверка' : 'ожидание';
  s.resources.filling.state = s.filler ? 'фасовка' : 'ожидание';
  if (requiredA > p.capacityA + EPS || requiredB > p.capacityB + EPS) {
    s.blockedReason = 'Объём компонента для одной партии превышает вместимость его резервуара. Уменьшите партию или увеличьте вместимость.';
  } else {
    s.blockedReason = s.resources.receiving.reason ?? s.resources.mixing.reason;
  }
  return s;
}

export function getResults(s: SimulationSnapshot): SimulationResults {
  const finished = s.completedBatches;
  const readyVolume = finished.reduce((sum, batch) => sum + batch.volume, 0);
  const totalCost = finished.reduce((sum, batch) => sum + (batch.cost ?? 0), 0);
  return {
    completedTrucks: s.completedTrucks.length,
    queueAtEnd: s.queue.length,
    averageWaitMinutes: s.completedTrucks.length ? s.completedTrucks.reduce((sum, truck) => sum + (truck.startedAt ?? truck.arrivedAt) - truck.arrivedAt, 0) / s.completedTrucks.length : 0,
    readyVolume,
    completedBatches: finished.length,
    unfinishedBatches: Number(s.mixer !== null) + Number(s.filler !== null),
    averageBatchMinutes: finished.length ? finished.reduce((sum, batch) => sum + (batch.completedAt ?? batch.startedAt) - batch.startedAt, 0) / finished.length : 0,
    totalCost,
    costPerLiter: readyVolume ? totalCost / readyVolume : 0,
    utilization: { receiving: s.resources.receiving.utilization, mixing: s.resources.mixing.utilization, quality: s.resources.quality.utilization, filling: s.resources.filling.utilization },
  };
}
