// Parametrizaciones puras de almacén. La escena Three.js las convierte en
// geometría, mientras que el simulador usa la misma configuración para crear
// objetivos reproducibles en cada estructura.

const freeze = layout => Object.freeze({
  ...layout,
  rackRows: Object.freeze([...layout.rackRows]),
  aisleCenters: Object.freeze([...layout.aisleCenters]),
  crossAisles: Object.freeze([...(layout.crossAisles || [])]),
});

export const WAREHOUSE_LAYOUTS = Object.freeze({
  standard: freeze({
    id: 'standard',
    label: 'RACK GRID',
    description: 'cinco filas paralelas',
    rackRows: [-24, -12, 0, 12, 24],
    aisleCenters: [-18, -6, 6, 18],
    bayWidth: 6.4,
    rackDepth: 2.7,
    crossAisleWidth: 0,
  }),
  cross: freeze({
    id: 'cross',
    label: 'CROSS AISLE',
    description: 'cruce central de transferencia',
    rackRows: [-24, -12, 0, 12, 24],
    aisleCenters: [-18, -6, 6, 18],
    crossAisles: [0],
    bayWidth: 6.4,
    rackDepth: 2.7,
    crossAisleWidth: 4.8,
  }),
  narrow: freeze({
    id: 'narrow',
    label: 'NARROW MAZE',
    description: 'pasillos estrechos',
    rackRows: [-27, -18, -9, 0, 9, 18, 27],
    aisleCenters: [-22.5, -13.5, -4.5, 4.5, 13.5, 22.5],
    crossAisles: [-14, 14],
    bayWidth: 5.4,
    rackDepth: 2.25,
    crossAisleWidth: 3.6,
  }),
  open: freeze({
    id: 'open',
    label: 'OPEN FLOOR',
    description: 'planta despejada',
    rackRows: [],
    aisleCenters: [],
    bayWidth: 6.4,
    rackDepth: 2.7,
    crossAisleWidth: 0,
    open: true,
  }),
  dense: freeze({
    id: 'dense',
    label: 'DENSE STORAGE',
    description: 'máxima densidad de estanterías',
    rackRows: [-27, -18, -9, 0, 9, 18, 27],
    aisleCenters: [-22.5, -13.5, -4.5, 4.5, 13.5, 22.5],
    crossAisles: [0],
    bayWidth: 5.4,
    rackDepth: 2.45,
    crossAisleWidth: 3.2,
  }),
});

export function layoutFor(id = 'standard') {
  return WAREHOUSE_LAYOUTS[id] || WAREHOUSE_LAYOUTS.standard;
}

export function targetForLayout(episode, profile = 'normal', layoutId = 'standard') {
  const layout = layoutFor(layoutId);
  const aisles = layout.aisleCenters;
  const hasAisles = aisles.length > 0;
  const aisleIndex = hasAisles ? Math.abs(episode * 3) % aisles.length : 0;
  const x = layout.open ? -22 + ((episode * 11) % 45) : -24 + ((episode * 5) % 6) * 3;
  const z = hasAisles ? aisles[aisleIndex] : -22 + ((episode * 7) % 45);
  const y = profile === 'hard' ? 2.1 + (episode * 7 % 4) * 1.05 : profile === 'easy' ? 2.8 + (episode % 2) * .6 : 3.1 + (episode * 7 % 3) * .8;
  const aisle = hasAisles ? `A${String(aisleIndex + 1).padStart(2, '0')}` : 'OPEN';
  const binNumber = String(14 + (episode * 5 % 12)).padStart(3, '0');
  return {
    x,
    y,
    z,
    aisle,
    bin: `${aisle} · ${binNumber}`,
    layoutId: layout.id,
    custom: false,
  };
}
