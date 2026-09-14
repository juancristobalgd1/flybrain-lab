// Funciones puras de mercado/contabilidad, sin dependencias del DOM.
// Se importan tanto desde trading.js (navegador) como desde tests/core.test.mjs (Node).
// Mantenerlas puras es lo que permite testear P0 sin bundler ni framework.

export function seededRng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalFrom(rand) {
  return Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-9))) * Math.cos(2 * Math.PI * rand());
}

export function phaseFor(episode) {
  return episode % 10 === 0 ? 'TEST' : episode % 10 >= 8 ? 'VALIDATION' : 'TRAIN';
}

// P0 fix: antes la semilla de mercado era `episode*977` para TODAS las fases, así que
// TEST usaba el mismo generador/espacio de muestreo que TRAIN, solo con distinto índice.
// Eso no es un holdout independiente, es la misma distribución re-muestreada.
// Aquí TEST recibe una familia de semillas disjunta (multiplicador y offset distintos)
// para que al menos dentro de los datos sintéticos actuales no comparta trayectoria
// derivable con TRAIN/VALIDATION. Sigue sin ser un holdout real hasta el punto P2
// (datos históricos con partición temporal) — esto es una mitigación parcial, no la solución.
export function seedForEpisode(episode) {
  return phaseFor(episode) === 'TEST' ? episode * 104729 + 7919 : episode * 977;
}

export function computeFill(open, direction, spreadBps, slippageBps) {
  return open * (1 + (direction * (spreadBps / 2 + slippageBps)) / 10000);
}

export function computeCommission(notional, commissionBps) {
  return (notional * commissionBps) / 10000;
}

export function stepReward({ equityBefore, equityAfter, tradeReward, ddIncrease, stepTurnover, opportunityCost, startingCapital }) {
  return (
    ((equityAfter - equityBefore) / startingCapital) * 0.2 +
    tradeReward -
    ddIncrease * 0.25 -
    stepTurnover * 0.0002 -
    opportunityCost
  );
}

// Baseline "random policy" barato (punto 11 de la auditoría): no requiere un segundo
// worker/red, solo una política uniforme sobre el mismo espacio de acciones válidas.
// Se usa como sombra comparativa, no como sustituto del control con topología congelada
// (ese vive en snn-worker.js vía el modo `control`).
export function randomPolicyAction(rand, actionsCount) {
  return Math.floor(rand() * actionsCount);
}
