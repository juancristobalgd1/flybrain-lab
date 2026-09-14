import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  seededRng,
  phaseFor,
  seedForEpisode,
  computeFill,
  computeCommission,
  stepReward,
  randomPolicyAction,
} from '../lib/market-core.mjs';

test('phaseFor: TEST cada 10 episodios, VALIDATION en 8 y 9, TRAIN el resto', () => {
  const phases = Array.from({ length: 20 }, (_, i) => phaseFor(i));
  assert.equal(phases[0], 'TEST'); // episode 0 % 10 === 0
  assert.equal(phases[10], 'TEST');
  assert.equal(phases[8], 'VALIDATION');
  assert.equal(phases[9], 'VALIDATION');
  assert.equal(phases[1], 'TRAIN');
  assert.equal(phases[7], 'TRAIN');
});

test('seedForEpisode: TEST usa un namespace de 32 bits disjunto de TRAIN/VALIDATION (P0 fix #2)', () => {
  for (let episode = 0; episode < 1_000_000; episode++) {
    const seed = seedForEpisode(episode);
    const isTestNamespace = (seed >>> 31) === 1;
    assert.equal(isTestNamespace, phaseFor(episode) === 'TEST');
  }
});

test('seededRng: determinismo — misma semilla produce la misma secuencia', () => {
  const a = seededRng(12345);
  const b = seededRng(12345);
  const seqA = Array.from({ length: 20 }, () => a());
  const seqB = Array.from({ length: 20 }, () => b());
  assert.deepEqual(seqA, seqB);
});

test('seededRng: semillas distintas producen secuencias distintas', () => {
  const a = seededRng(1);
  const b = seededRng(2);
  assert.notEqual(a(), b());
});

test('computeFill: BUY (direction=1) paga peor precio que el mid, SELL (direction=-1) recibe peor precio', () => {
  const open = 100;
  const buyFill = computeFill(open, 1, 4, 2);
  const sellFill = computeFill(open, -1, 4, 2);
  assert.ok(buyFill > open, 'comprar debe ejecutar por encima del precio de referencia (spread+slippage en contra)');
  assert.ok(sellFill < open, 'vender debe ejecutar por debajo del precio de referencia');
  assert.ok(Math.abs(buyFill - open - (open - sellFill)) < 1e-9, 'el coste debe ser simétrico en bps alrededor del mid');
});

test('computeCommission: proporcional al notional y a los bps configurados', () => {
  assert.equal(computeCommission(1000, 8), 0.8);
  assert.equal(computeCommission(0, 8), 0);
});

test('stepReward: no depende de ningún valor "futuro" — solo de equity antes/después del fill ya ejecutado', () => {
  const base = {
    equityBefore: 20,
    equityAfter: 20.5,
    tradeReward: 0,
    ddIncrease: 0,
    stepTurnover: 0,
    opportunityCost: 0,
    startingCapital: 20,
  };
  const r1 = stepReward(base);
  // Cambiar solo equityAfter (lo único "adelantado" en el tiempo dentro de esta llamada)
  // debe mover el reward monótonamente; ningún otro campo debe hacerlo por sí solo si no cambia.
  const r2 = stepReward({ ...base, equityAfter: 21 });
  assert.ok(r2 > r1, 'más equity final con el resto igual debe dar más reward');
  const r3 = stepReward({ ...base, ddIncrease: 0.01 });
  assert.ok(r3 < r1, 'un incremento de drawdown debe penalizar el reward');
});

test('randomPolicyAction: siempre devuelve un índice válido dentro del espacio de acciones', () => {
  const rand = seededRng(7);
  for (let i = 0; i < 500; i++) {
    const action = randomPolicyAction(rand, 7);
    assert.ok(action >= 0 && action < 7);
  }
});
