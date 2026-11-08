/**
 * Дискретно-событийная модель участка технических масел. Цепочка из ТЗ:
 *   автоцистерна → приём → резервуары → подача в цех → смешивание → контроль качества → фасовка → склад.
 *
 *  ВНЕШНИЙ процесс — «Приём автоцистерн»: КПП → весы (брутто) → входной контроль сырья → слив в резервуар
 *                    → весы (тара) → документы → выезд.
 *  ВНУТРЕННИЙ процесс — «Производство»: подача компонентов A и B в цех → смешивание → контроль качества партии
 *                    → фасовка в бочки → склад готовой продукции.
 *
 * Процессы связаны через уровни в резервуарах (полный резервуар — цистерна ждёт, пустой — цех простаивает)
 * и через общие ресурсы: лабораторию и насосную. Модель детерминирована при одинаковом seed.
 */

export type PrepMode = 'on-arrival' | 'prebooked';

export interface TwinParams {
  shiftHours: number;
  trucksPerHour: number; // прибытие автоцистерн с сырьём
  gates: number;
  scales: number;
  bays: number; // постов слива
  pumpRate: number; // м³/ч слива на одном посту
  truckVolume: number; // м³ сырья в цистерне
  docCheckMin: number;
  labMin: number; // контроль качества партии, мин
  inLabMin: number; // входной контроль пробы сырья, мин
  batchEvery: number; // (резерв) совместимость API
  prepMode: PrepMode; // предзапись: документы и сертификат поставки до приезда
  automation: boolean; // автоматизация приёма: автоподключение, расходомер, поточный анализатор, ЭТрН
  dispatchers: number;
  tankCapacity: number; // м³ на компонент (два резервуара)
  initialLevel: number; // начальный уровень, доля
  batches: number; // плановых партий за смену
  batchM3: number; // объём партии смеси, м³
  shareA: number; // доля компонента A в рецептуре
  blendMin: number; // время смешивания
  blenders: number;
  lines: number; // линий фасовки
  fillRate: number; // м³/ч на линию фасовки
  canisterL: number; // объём тары (бочка), л
  dedicatedPump: boolean; // отдельный насос подачи в цех
  costIdleHour: number;
  costBayShift: number;
  marginM3: number; // маржа на м³ готовой продукции, ₽
  seed: number;
}

export const DEFAULT_PARAMS: TwinParams = {
  shiftHours: 8,
  trucksPerHour: 1.25,
  gates: 1,
  scales: 1,
  bays: 2,
  pumpRate: 50,
  truckVolume: 20,
  docCheckMin: 6,
  labMin: 25,
  inLabMin: 14,
  batchEvery: 6,
  prepMode: 'on-arrival',
  automation: false,
  dispatchers: 1,
  tankCapacity: 110,
  initialLevel: 0.5,
  batches: 8,
  batchM3: 18,
  shareA: 0.6,
  blendMin: 30,
  blenders: 1,
  lines: 1,
  fillRate: 24,
  canisterL: 216,
  dedicatedPump: false,
  costIdleHour: 2400,
  costBayShift: 12000,
  marginM3: 6000,
  seed: 42
};

export type ResourceId = 'gate' | 'scales' | 'bays' | 'dispatcher' | 'lab' | 'operator' | 'blender' | 'line';

export const RESOURCE_LABEL: Record<ResourceId, string> = {
  gate: 'КПП',
  scales: 'Автовесы',
  bays: 'Посты слива',
  dispatcher: 'Диспетчер',
  lab: 'Лаборатория',
  operator: 'Насосная',
  blender: 'Смеситель',
  line: 'Линия фасовки'
};

export interface TruckTrace {
  id: number;
  plate: string;
  component: 0 | 1; // 0 — A, 1 — B
  volume: number;
  arrive: number;
  gateStart: number;
  gateEnd: number;
  tareStart: number; // первое взвешивание (брутто)
  tareEnd: number;
  prepStart: number; // начало входного контроля
  orderDone: number; // документы приняты
  qualityDone: number; // проба сырья одобрена
  readyAt: number; // допущена к сливу (проба + место в резервуаре)
  bay: number;
  bayStart: number;
  fillStart: number; // начало слива
  fillEnd: number;
  bayEnd: number;
  grossStart: number; // второе взвешивание (тара)
  grossEnd: number;
  exit: number;
  tankWait: number; // ожидание свободного места в резервуаре, мин
}

export interface BatchTrace {
  id: number;
  product: number; // рецептура 0..3
  m3: number;
  units: number; // бочек
  planned: number;
  feedStart: number;
  feedEnd: number;
  starved: number; // ожидание компонентов, мин
  blendStart: number;
  blendEnd: number;
  qcStart: number;
  qcEnd: number;
  line: number;
  lineStart: number;
  lineEnd: number;
  done: number;
}

export interface TwinEvent {
  t: number;
  kind: 'arrive' | 'gate' | 'lab' | 'prep' | 'bay' | 'fill' | 'seal' | 'exit' | 'alert' | 'bottle';
  process: 'internal' | 'external';
  truck?: number;
  text: string;
}

export interface ResourceStat {
  id: ResourceId;
  label: string;
  capacity: number;
  utilization: number;
  avgWait: number;
  maxQueue: number;
}

export interface TwinResult {
  params: TwinParams;
  horizon: number;
  trucks: TruckTrace[];
  batches: BatchTrace[];
  events: TwinEvent[];
  resources: ResourceStat[];
  queueSeries: { t: number; onSite: number; waitingBay: number }[];
  levelSeries: { t: number; a: number; b: number }[]; // доли заполнения резервуаров
  metrics: {
    served: number;
    arrived: number;
    volume: number; // принято сырья, м³
    avgTurnaround: number;
    p90Turnaround: number;
    avgWait: number;
    maxQueue: number;
    idleCost: number;
    opCost: number;
    totalCost: number;
    costPerM3: number; // на м³ готовой продукции
    bottleneck: ResourceId;
    bottledUnits: number;
    bottledM3: number;
    batchesDone: number;
    batchDelay: number; // среднее время партии от плана до склада
    starvedMin: number; // простой цеха из-за нехватки компонентов
    tankFullWait: number; // суммарное ожидание цистерн из-за полного резервуара
    margin: number; // маржа смены: выпуск × маржа − затраты
    planDone: number; // выполнение плана выпуска, доля
  };
}

export const RECIPES = ['И-20А', 'И-40А', 'ИГП-30', 'И-50А'];

/* ---------- инфраструктура ---------- */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const tri = (r: Rng, min: number, mode: number, max: number) => {
  const u = r();
  const c = (mode - min) / (max - min);
  return u < c ? min + Math.sqrt(u * (max - min) * (mode - min)) : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
};
const expo = (r: Rng, mean: number) => -Math.log(1 - r()) * mean;

interface QItem { t: number; seq: number; fn: () => void }

class EventQueue {
  private heap: QItem[] = [];
  private seq = 0;
  now = 0;
  at(t: number, fn: () => void) {
    const item = { t, seq: this.seq++, fn };
    const h = this.heap;
    h.push(item);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(h[p], h[i])) break;
      [h[p], h[i]] = [h[i], h[p]];
      i = p;
    }
  }
  after(dt: number, fn: () => void) { this.at(this.now + dt, fn); }
  private less(a: QItem, b: QItem) { return a.t < b.t || (a.t === b.t && a.seq < b.seq); }
  run(limit: number) {
    const h = this.heap;
    let guard = 0;
    while (h.length && guard++ < 500_000) {
      const top = h[0];
      const last = h.pop()!;
      if (h.length) {
        h[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < h.length && this.less(h[l], h[m])) m = l;
          if (r < h.length && this.less(h[r], h[m])) m = r;
          if (m === i) break;
          [h[m], h[i]] = [h[i], h[m]];
          i = m;
        }
      }
      if (top.t > limit) break;
      this.now = top.t;
      top.fn();
    }
  }
}

class Resource {
  busy = 0;
  busyTime = 0;
  lastChange = 0;
  waitSum = 0;
  waitCount = 0;
  maxQueue = 0;
  private queue: { since: number; cb: (unit: number) => void }[] = [];
  private freeUnits: number[];
  constructor(private q: EventQueue, public capacity: number) {
    this.freeUnits = Array.from({ length: capacity }, (_, i) => i);
  }
  private account() {
    this.busyTime += this.busy * (this.q.now - this.lastChange);
    this.lastChange = this.q.now;
  }
  get queued() { return this.queue.length; }
  request(cb: (unit: number) => void) {
    if (this.busy < this.capacity) {
      this.account();
      this.busy++;
      this.waitCount++;
      cb(this.freeUnits.shift()!);
    } else {
      this.queue.push({ since: this.q.now, cb });
      this.maxQueue = Math.max(this.maxQueue, this.queue.length);
    }
  }
  release(unit: number) {
    const next = this.queue.shift();
    if (next) {
      this.waitSum += this.q.now - next.since;
      this.waitCount++;
      next.cb(unit);
    } else {
      this.account();
      this.busy--;
      this.freeUnits.push(unit);
      this.freeUnits.sort((a, b) => a - b);
    }
  }
  finish(horizon: number) {
    this.busyTime += this.busy * (horizon - this.lastChange);
    this.lastChange = horizon;
  }
}

const REGIONS = ['77', '50', '199', '750', '97', '177'];
const LETTERS = 'АВЕКМНОРСТУХ';
function plate(r: Rng) {
  const l = () => LETTERS[Math.floor(r() * LETTERS.length)];
  return `${l()}${100 + Math.floor(r() * 899)}${l()}${l()} ${REGIONS[Math.floor(r() * REGIONS.length)]}`;
}

export const fmtClock = (min: number) => {
  const t = Math.max(0, Math.round(min)) + 8 * 60;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/* ---------- модель ---------- */

export function simulate(input: Partial<TwinParams> = {}): TwinResult {
  const p: TwinParams = { ...DEFAULT_PARAMS, ...input };
  const rnd = mulberry32(p.seed);
  const q = new EventQueue();
  const R = {
    gate: new Resource(q, p.gates),
    scales: new Resource(q, p.scales),
    bays: new Resource(q, p.bays),
    dispatcher: new Resource(q, p.dispatchers),
    lab: new Resource(q, 1),
    operator: new Resource(q, 1),
    blender: new Resource(q, p.blenders),
    line: new Resource(q, p.lines)
  };
  const feedPump = p.dedicatedPump ? new Resource(q, 1) : R.operator;
  const shiftEnd = p.shiftHours * 60;
  const limit = shiftEnd + 240;
  const auto = p.automation;
  const pre = p.prepMode === 'prebooked';
  const trucks: TruckTrace[] = [];
  const batches: BatchTrace[] = [];
  const events: TwinEvent[] = [];
  const log = (e: Omit<TwinEvent, 't'>) => events.push({ t: q.now, ...e });
  const CN = ['A', 'B'];

  /* ----- резервуары: уровень и резерв места под сливающиеся цистерны ----- */
  const level = [p.tankCapacity * p.initialLevel, p.tankCapacity * p.initialLevel];
  const reserved = [0, 0];
  const levelSeries: TwinResult['levelSeries'] = [];
  const snap = () => levelSeries.push({ t: q.now, a: level[0] / p.tankCapacity, b: level[1] / p.tankCapacity });
  const spaceWaiters: { c: number; v: number; since: number; go: () => void; t: TruckTrace }[] = [];
  const stockWaiters: { need: [number, number]; since: number; go: () => void; b: BatchTrace }[] = [];
  const pump = () => {
    // цистерны, которым освободилось место
    for (let i = 0; i < spaceWaiters.length; ) {
      const w = spaceWaiters[i];
      if (level[w.c] + reserved[w.c] + w.v <= p.tankCapacity) {
        reserved[w.c] += w.v;
        w.t.tankWait = q.now - w.since;
        spaceWaiters.splice(i, 1);
        w.go();
      } else i++;
    }
    // партии, которым хватает компонентов
    for (let i = 0; i < stockWaiters.length; ) {
      const w = stockWaiters[i];
      if (level[0] >= w.need[0] && level[1] >= w.need[1]) {
        level[0] -= w.need[0];
        level[1] -= w.need[1];
        w.b.starved = q.now - w.since;
        stockWaiters.splice(i, 1);
        snap();
        w.go();
        pump();
        return;
      } else i++;
    }
  };
  const reserveSpace = (t: TruckTrace, go: () => void) => {
    const c = t.component;
    if (level[c] + reserved[c] + t.volume <= p.tankCapacity && !spaceWaiters.some((w) => w.c === c)) {
      reserved[c] += t.volume;
      t.tankWait = 0;
      go();
    } else {
      log({ kind: 'alert', process: 'external', truck: t.id, text: `${t.plate}: резервуар ${CN[c]} заполнен — ждёт освобождения места` });
      spaceWaiters.push({ c, v: t.volume, since: q.now, go, t });
    }
  };
  const takeStock = (b: BatchTrace, go: () => void) => {
    const need: [number, number] = [b.m3 * p.shareA, b.m3 * (1 - p.shareA)];
    if (!stockWaiters.length && level[0] >= need[0] && level[1] >= need[1]) {
      level[0] -= need[0];
      level[1] -= need[1];
      b.starved = 0;
      snap();
      go();
      pump();
    } else {
      log({ kind: 'alert', process: 'internal', text: `Партия №${b.id}: не хватает компонентов в резервуарах — цех ждёт сырьё` });
      stockWaiters.push({ need, since: q.now, go, b });
    }
  };

  /* ----- ВНЕШНИЙ процесс: приём автоцистерны ----- */
  const truckFlow = (t: TruckTrace) => {
    log({ kind: 'arrive', process: 'external', truck: t.id, text: `${t.plate} с компонентом ${CN[t.component]} (${t.volume} м³) прибыла на КПП` });
    R.gate.request((g) => {
      t.gateStart = q.now;
      const base = p.docCheckMin * (pre ? 0.45 : 1) * (auto ? 0.8 : 1);
      q.after(tri(rnd, base * 0.6, base, base * 1.7), () => {
        R.gate.release(g);
        t.gateEnd = q.now;
        R.scales.request((s) => {
          t.tareStart = q.now;
          q.after(tri(rnd, 2, 3, 5), () => {
            R.scales.release(s);
            t.tareEnd = q.now;
            // входной контроль: документы у диспетчера и проба сырья в лаборатории
            t.prepStart = q.now;
            const docs = (done: () => void) => {
              if (pre) { t.orderDone = q.now; return done(); }
              R.dispatcher.request((d) => q.after(auto ? tri(rnd, 1, 2, 3) : tri(rnd, 4, 6, 10), () => { R.dispatcher.release(d); t.orderDone = q.now; done(); }));
            };
            docs(() => {
              R.lab.request((l) => {
                const lm = auto ? p.inLabMin * 0.35 : pre ? p.inLabMin * 0.7 : p.inLabMin;
                q.after(tri(rnd, lm * 0.7, lm, lm * 1.4), () => {
                  R.lab.release(l);
                  t.qualityDone = q.now;
                  log({ kind: 'lab', process: 'external', truck: t.id, text: `${t.plate}: проба сырья ${CN[t.component]} соответствует` });
                  reserveSpace(t, () => {
                    t.readyAt = q.now;
                    R.bays.request((b) => {
                      t.bay = b;
                      t.bayStart = q.now;
                      log({ kind: 'bay', process: 'external', truck: t.id, text: `${t.plate} на посту слива №${b + 1}: заземление, подключение` });
                      q.after(auto ? tri(rnd, 2.5, 3, 4.5) : tri(rnd, 6, 8, 12), () => {
                        // оператор насосной открывает маршрут в резервуар
                        R.operator.request((o) => q.after(auto ? tri(rnd, 1, 1.5, 2.5) : tri(rnd, 3, 5, 8), () => {
                          R.operator.release(o);
                          t.fillStart = q.now;
                          q.after((t.volume / p.pumpRate) * 60 * tri(rnd, 0.95, 1, 1.12), () => {
                            t.fillEnd = q.now;
                            reserved[t.component] -= t.volume;
                            level[t.component] += t.volume;
                            snap();
                            log({ kind: 'fill', process: 'external', truck: t.id, text: `${t.plate}: слито ${t.volume} м³ в резервуар ${CN[t.component]}` });
                            pump();
                            q.after(auto ? tri(rnd, 2, 2.5, 4) : tri(rnd, 4, 6, 9), () => {
                              R.bays.release(b);
                              t.bayEnd = q.now;
                              R.scales.request((s2) => {
                                t.grossStart = q.now;
                                q.after(tri(rnd, 2, 3, 5), () => {
                                  R.scales.release(s2);
                                  t.grossEnd = q.now;
                                  R.dispatcher.request((d) => q.after(auto ? tri(rnd, 0.5, 1, 2) : tri(rnd, 3, 5, 8), () => {
                                    R.dispatcher.release(d);
                                    t.exit = q.now;
                                    const turn = t.exit - t.arrive;
                                    log({ kind: 'exit', process: 'external', truck: t.id, text: `${t.plate} выехала, оборот ${Math.round(turn)} мин` });
                                    if (turn > 150) log({ kind: 'alert', process: 'external', truck: t.id, text: `Долгий оборот ${t.plate}: ${Math.round(turn)} мин` });
                                  }));
                                });
                              });
                            });
                          });
                        }));
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  };

  /* ----- ВНУТРЕННИЙ процесс: производство партии ----- */
  const batchFlow = (b: BatchTrace) => {
    const name = RECIPES[b.product];
    log({ kind: 'bottle', process: 'internal', text: `Партия №${b.id} (${name}, ${b.m3} м³): заявка на подачу компонентов` });
    R.blender.request((bl) => {
      takeStock(b, () => {
        b.feedStart = q.now;
        feedPump.request((o) => {
          q.after(auto ? tri(rnd, 3, 4, 6) : tri(rnd, 7, 10, 15), () => {
            feedPump.release(o);
            b.feedEnd = q.now;
            b.blendStart = q.now;
            q.after(tri(rnd, p.blendMin * 0.85, p.blendMin, p.blendMin * 1.25), () => {
              b.blendEnd = q.now;
              // партия остаётся в смесителе до заключения лаборатории
              R.lab.request((l) => {
                b.qcStart = q.now;
                q.after(tri(rnd, p.labMin * 0.7, p.labMin, p.labMin * 1.4), () => {
                  R.lab.release(l);
                  b.qcEnd = q.now;
                  log({ kind: 'bottle', process: 'internal', text: `Партия №${b.id}: контроль качества пройден, паспорт выдан` });
                  R.line.request((ln) => {
                    R.blender.release(bl);
                    b.line = ln;
                    b.lineStart = q.now;
                    q.after((b.m3 / p.fillRate) * 60 * tri(rnd, 0.97, 1, 1.1), () => {
                      R.line.release(ln);
                      b.lineEnd = q.now;
                      q.after(tri(rnd, 5, 8, 12), () => {
                        b.done = q.now;
                        log({ kind: 'bottle', process: 'internal', text: `Партия №${b.id}: ${b.units} бочек на складе` });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  };

  // прибытия автоцистерн
  let tArr = expo(rnd, 60 / p.trucksPerHour) * 0.5;
  let id = 1;
  while (tArr < shiftEnd) {
    const vol = Math.round(tri(rnd, p.truckVolume * 0.75, p.truckVolume, p.truckVolume * 1.1));
    const t: TruckTrace = {
      id: id++, plate: plate(rnd), component: rnd() < p.shareA ? 0 : 1, volume: vol, arrive: tArr,
      gateStart: NaN, gateEnd: NaN, tareStart: NaN, tareEnd: NaN, prepStart: NaN, orderDone: NaN, qualityDone: NaN, readyAt: NaN,
      bay: -1, bayStart: NaN, fillStart: NaN, fillEnd: NaN, bayEnd: NaN, grossStart: NaN, grossEnd: NaN, exit: NaN, tankWait: 0
    };
    trucks.push(t);
    q.at(tArr, () => truckFlow(t));
    tArr += expo(rnd, 60 / p.trucksPerHour);
  }
  // план производства
  const step = (shiftEnd - 60) / Math.max(1, p.batches);
  for (let k = 0; k < p.batches; k++) {
    const m3 = Math.round(p.batchM3 * tri(rnd, 0.9, 1, 1.08) * 10) / 10;
    const b: BatchTrace = {
      id: k + 1, product: k % 4, m3, units: Math.round((m3 * 1000) / p.canisterL), planned: 5 + k * step,
      feedStart: NaN, feedEnd: NaN, starved: 0, blendStart: NaN, blendEnd: NaN, qcStart: NaN, qcEnd: NaN,
      line: -1, lineStart: NaN, lineEnd: NaN, done: NaN
    };
    batches.push(b);
    q.at(b.planned, () => batchFlow(b));
  }

  const queueSeries: TwinResult['queueSeries'] = [];
  const sample = () => {
    const now = q.now;
    let onSite = 0, waitingBay = 0;
    for (const t of trucks) {
      if (t.arrive <= now && !(t.exit <= now)) onSite++;
      if (t.tareEnd <= now && !(t.bayStart <= now)) waitingBay++;
    }
    queueSeries.push({ t: now, onSite, waitingBay });
    snap();
    if (now + 10 <= limit) q.after(10, sample);
  };
  q.at(0, sample);
  q.run(limit);

  const done = trucks.filter((t) => Number.isFinite(t.exit));
  const horizon = Math.max(shiftEnd, ...done.map((t) => t.exit), ...batches.filter((b) => Number.isFinite(b.done)).map((b) => Math.min(b.done, limit)));
  const resources: ResourceStat[] = (Object.keys(R) as ResourceId[]).map((k) => {
    const r = R[k];
    r.finish(horizon);
    return { id: k, label: RESOURCE_LABEL[k], capacity: r.capacity, utilization: Math.min(1, r.busyTime / (horizon * r.capacity)), avgWait: r.waitCount ? r.waitSum / r.waitCount : 0, maxQueue: r.maxQueue };
  });

  const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  const turns = done.map((t) => t.exit - t.arrive).sort((a, b) => a - b);
  const pureService = (t: TruckTrace) => (t.gateEnd - t.gateStart) + (t.tareEnd - t.tareStart) + (t.bayEnd - t.bayStart) + (t.grossEnd - t.grossStart);
  const waits = done.map((t) => t.exit - t.arrive - pureService(t));
  const volume = trucks.filter((t) => Number.isFinite(t.fillEnd)).reduce((s, t) => s + t.volume, 0);
  const doneBatches = batches.filter((b) => b.lineEnd <= shiftEnd + 15); // выпуск в пределах смены
  const bottledUnits = doneBatches.reduce((a, b) => a + b.units, 0);
  const bottledM3 = (bottledUnits * p.canisterL) / 1000;
  const lostBatches = p.batches - doneBatches.length;
  const idleCost = waits.reduce((s, w) => s + Math.max(0, w), 0) / 60 * p.costIdleHour;
  const starvedMin = batches.reduce((s, b) => s + b.starved, 0);
  const opCost =
    p.bays * p.costBayShift + p.scales * 6000 + p.gates * 5000 + p.dispatchers * 7000 +
    p.blenders * 15000 + p.lines * 9000 + (p.dedicatedPump ? 6500 : 0) + (auto ? 20000 : 0) + (pre ? 4500 : 0) +
    (starvedMin / 60) * 6000; // простой цеха из-за нехватки сырья
  const totalCost = idleCost + opCost;
  const bottleneck = [...resources].sort((a, b) => b.avgWait * (0.5 + b.utilization) - a.avgWait * (0.5 + a.utilization))[0].id;
  events.sort((a, b) => a.t - b.t);

  return {
    params: p, horizon, trucks, batches, events, resources, queueSeries, levelSeries,
    metrics: {
      served: done.length,
      arrived: trucks.length,
      volume,
      avgTurnaround: avg(turns),
      p90Turnaround: turns.length ? turns[Math.min(turns.length - 1, Math.floor(turns.length * 0.9))] : 0,
      avgWait: avg(waits),
      maxQueue: Math.max(0, ...queueSeries.map((s) => s.waitingBay)),
      idleCost, opCost, totalCost,
      costPerM3: bottledM3 ? totalCost / bottledM3 : 0,
      bottleneck,
      bottledUnits,
      bottledM3,
      batchesDone: doneBatches.length,
      batchDelay: avg(batches.filter((b) => Number.isFinite(b.done)).map((b) => b.done - b.planned)),
      starvedMin,
      tankFullWait: trucks.reduce((s, t) => s + t.tankWait, 0),
      margin: bottledM3 * p.marginM3 - totalCost,
      planDone: p.batches ? doneBatches.length / p.batches : 1
    }
  };
}
