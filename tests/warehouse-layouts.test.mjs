import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WAREHOUSE_LAYOUTS, layoutFor, targetForLayout } from '../lib/warehouse-layouts.mjs';

test('layoutFor devuelve una estructura válida y usa RACK GRID como fallback', () => {
  assert.equal(layoutFor('standard').label, 'RACK GRID');
  assert.equal(layoutFor('missing').id, 'standard');
  for (const layout of Object.values(WAREHOUSE_LAYOUTS)) {
    assert.ok(Array.isArray(layout.rackRows));
    assert.ok(Array.isArray(layout.aisleCenters));
    assert.ok(layout.bayWidth > 0);
  }
});

test('las configuraciones ofrecen geometrías distintas para probar el vuelo', () => {
  assert.notEqual(WAREHOUSE_LAYOUTS.standard.rackRows.length, WAREHOUSE_LAYOUTS.narrow.rackRows.length);
  assert.equal(WAREHOUSE_LAYOUTS.open.rackRows.length, 0);
  assert.ok(WAREHOUSE_LAYOUTS.cross.crossAisles.length > 0);
});

test('targetForLayout es determinista y siempre usa un pasillo de la configuración', () => {
  for (const id of Object.keys(WAREHOUSE_LAYOUTS)) {
    const a = targetForLayout(17, 'normal', id);
    const b = targetForLayout(17, 'normal', id);
    assert.deepEqual(a, b);
    assert.equal(a.layoutId, id);
    assert.ok(a.x >= -24 && a.x <= 24);
    assert.ok(a.z >= -27 && a.z <= 27);
    if (WAREHOUSE_LAYOUTS[id].aisleCenters.length) assert.ok(WAREHOUSE_LAYOUTS[id].aisleCenters.includes(a.z));
    else assert.equal(a.aisle, 'OPEN');
  }
});
