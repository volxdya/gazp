import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PARAMETERS, getResults, simulate, transferTime, validateParameters,
  viscosityFactor, type Parameters, type SimulationSnapshot,
} from './simulation';

function close(actual: number, expected: number, tolerance = 1e-5) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);
}

function verifyMaterial(s: SimulationSnapshot) {
  const batches = [...s.completedBatches, ...[s.mixer, s.filler].filter((batch) => batch !== null)];
  close(s.parameters.initialA + s.received.A, s.stocks.A + batches.reduce((sum, batch) => sum + batch.componentA, 0));
  close(s.parameters.initialB + s.received.B, s.stocks.B + batches.reduce((sum, batch) => sum + batch.componentB, 0));
  assert.ok(s.stocks.A >= -1e-6 && s.stocks.A <= s.parameters.capacityA + 1e-6);
  assert.ok(s.stocks.B >= -1e-6 && s.stocks.B <= s.parameters.capacityB + 1e-6);
  assert.equal(new Set(batches.map((batch) => batch.id)).size, batches.length, 'A batch owns exactly one location');
}

test('transfer calculation and synthetic viscosity interpolation', () => {
  close(transferTime(12_000, 600, 40), 20);
  close(transferTime(12_000, 600, 100), 25);
  close(viscosityFactor(70), 0.9);
  close(viscosityFactor(250), 0.525);
  assert.throws(() => viscosityFactor(301), RangeError);
  assert.throws(() => transferTime(100, 0), RangeError);
});

test('material conservation, capacity and partial tanker unloading across events', () => {
  const p: Parameters = {
    ...DEFAULT_PARAMETERS,
    arrivalInterval: 17,
    capacityA: 8_000, capacityB: 7_000,
    initialA: 7_500, initialB: 6_500,
  };
  let sawBlocked = false;
  for (let time = 0; time <= p.shiftMinutes; time += 3.7) {
    const s = simulate(p, time);
    verifyMaterial(s);
    sawBlocked ||= s.activeTruck?.stage === 'blocked';
  }
  assert.ok(sawBlocked, 'Small tanks must cause real blocking');
  const final = simulate(p);
  verifyMaterial(final);
  assert.ok(final.queue.length > 0);
  assert.ok(final.received.A + final.received.B < (Math.floor((p.shiftMinutes - 1e-8) / p.arrivalInterval) + 1) * p.deliveryVolume);
});

test('single mixer holds batches during quality and when the filler is occupied', () => {
  const p: Parameters = { ...DEFAULT_PARAMETERS, fillingRate: 100 };
  const atQuality = simulate(p, 20);
  assert.equal(atQuality.mixer?.id, 1);
  assert.equal(atQuality.mixer?.stage, 'quality');
  assert.equal(atQuality.filler, null);
  const waiting = simulate(p, 60);
  assert.equal(waiting.filler?.id, 1);
  assert.equal(waiting.mixer?.id, 2);
  assert.equal(waiting.mixer?.stage, 'waiting-filling');
  close(waiting.stocks.A + waiting.received.A * -1, p.initialA - 2 * 4200);
  const afterTransfer = simulate(p, 85);
  assert.equal(afterTransfer.completedBatches.length, 1);
  assert.equal(afterTransfer.filler?.id, 2);
  assert.equal(afterTransfer.mixer?.id, 3);
  close(afterTransfer.mixer!.startedAt, 85);
  for (const resource of Object.values(afterTransfer.resources)) {
    assert.ok(resource.busyMinutes <= afterTransfer.time + 1e-6);
    assert.ok(resource.utilization >= 0 && resource.utilization <= 1);
  }
  verifyMaterial(afterTransfer);
});

test('missing components and impossible recipes cannot spend unavailable inventory or stall', () => {
  const noB = simulate({ ...DEFAULT_PARAMETERS, initialB: 0, deliveryPattern: 'A' });
  assert.equal(getResults(noB).readyVolume, 0);
  assert.equal(noB.mixer, null);
  close(noB.stocks.B, 0);
  assert.ok(noB.queue.length > 0);
  verifyMaterial(noB);
  const impossible = simulate({ ...DEFAULT_PARAMETERS, capacityA: 3_000, initialA: 2_000 });
  assert.match(impossible.blockedReason!, /превышает вместимость/);
  assert.equal(impossible.completedBatches.length, 0);
  verifyMaterial(impossible);
  assert.ok(validateParameters({ ...DEFAULT_PARAMETERS, initialA: 90_000 }).length > 0);
});

test('replay is deterministic and results do not depend on observation frequency', () => {
  const baseline = simulate(DEFAULT_PARAMETERS);
  for (const time of [0, 0.3, 5, 15, 25, 74.2, 200, 479.9]) verifyMaterial(simulate(DEFAULT_PARAMETERS, time));
  assert.deepEqual(simulate(DEFAULT_PARAMETERS), baseline);
  assert.deepEqual(simulate({ ...DEFAULT_PARAMETERS }, 480), baseline);
  assert.equal(getResults(simulate(DEFAULT_PARAMETERS, 0)).readyVolume, 0);
});

test('comparison uses calculations and equal delivery schedules; faster filling moves the constraint', () => {
  const baseline = simulate(DEFAULT_PARAMETERS);
  const faster = simulate({ ...DEFAULT_PARAMETERS, fillingRate: DEFAULT_PARAMETERS.fillingRate * 2 });
  const baseResult = getResults(baseline);
  const fastResult = getResults(faster);
  assert.equal(baseline.time, faster.time);
  assert.deepEqual(baseline.received, faster.received);
  assert.equal(baseResult.readyVolume, 90_000);
  assert.equal(fastResult.readyVolume, 108_000);
  assert.ok(fastResult.readyVolume > baseResult.readyVolume);
  assert.ok(fastResult.readyVolume < baseResult.readyVolume * 2);
  assert.ok(baseResult.utilization.filling > fastResult.utilization.filling);
  assert.ok(fastResult.averageBatchMinutes < baseResult.averageBatchMinutes);
  assert.ok(fastResult.totalCost > 0 && fastResult.costPerLiter > 0);
});

test('pump rate, viscosity, delivery volume, recipe and packing rate affect relevant calculations', () => {
  const p = { ...DEFAULT_PARAMETERS, initialA: 0, initialB: 0, shiftMinutes: 180 };
  const reference = simulate(p);
  const slowPump = simulate({ ...p, receivingRate: 100 });
  assert.ok(getResults(slowPump).completedTrucks < getResults(reference).completedTrucks);
  const viscous = simulate({ ...p, viscosityA: 300, viscosityB: 300 });
  assert.ok(viscous.resources.receiving.busyMinutes > reference.resources.receiving.busyMinutes);
  const smallerLoads = simulate({ ...p, deliveryVolume: 3_000 });
  assert.ok(getResults(smallerLoads).readyVolume < getResults(reference).readyVolume);
  const otherRecipe = simulate({ ...DEFAULT_PARAMETERS, fractionB: 0.6 });
  assert.notEqual(otherRecipe.stocks.B, simulate(DEFAULT_PARAMETERS).stocks.B);
  assert.notEqual(getResults(otherRecipe).costPerLiter, getResults(simulate(DEFAULT_PARAMETERS)).costPerLiter);
});

test('prototype limits are validated and fast small deliveries do not leave numerical residue', () => {
  assert.ok(validateParameters({ ...DEFAULT_PARAMETERS, shiftMinutes: 10080 }).length > 0);
  assert.ok(validateParameters({ ...DEFAULT_PARAMETERS, arrivalInterval: 0.1 }).length > 0);
  assert.ok(validateParameters({ ...DEFAULT_PARAMETERS, receivingRate: 1e300 }).length > 0);
  const s = simulate({
    ...DEFAULT_PARAMETERS, shiftMinutes: 1440, arrivalInterval: 1,
    preparationMinutes: 0, finishingMinutes: 0, mixingMinutes: 1, qualityMinutes: 1,
    batchVolume: 100, deliveryVolume: 100, receivingRate: 10000, fillingRate: 10000,
    initialA: 100000, initialB: 100000, capacityA: 1000000, capacityB: 1000000,
  });
  assert.equal(s.completedTrucks.length, 1440);
  assert.ok(s.completedBatches.length > 700);
  verifyMaterial(s);
});
