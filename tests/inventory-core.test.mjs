import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INVENTORY_STATUS,
  createInventoryLedger,
  inventoryReading,
  inventoryStatusLabel,
  inventorySummary,
  markScanning,
  reconcileScan,
} from '../lib/inventory-core.mjs';

test('createInventoryLedger is deterministic and carries a stable SKU per bin', () => {
  const input = { episode: 17, layoutId: 'narrow', targetMeta: { aisle: 'A04', bin: 'A04 · 019' } };
  const first = createInventoryLedger(input);
  const second = createInventoryLedger(input);
  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
  assert.equal(first[0].id, 'A04-019');
  assert.match(first[0].sku, /^VYYQ-\d{3}$/);
  assert.equal(first[0].status, INVENTORY_STATUS.PENDING);
});

test('markScanning only opens the active uncounted bin', () => {
  const ledger = createInventoryLedger({ episode: 2, targetMeta: { aisle: 'A01', bin: 'A01 · 014' } });
  const scanning = markScanning(ledger, 1);
  assert.equal(scanning[0].status, INVENTORY_STATUS.PENDING);
  assert.equal(scanning[1].status, INVENTORY_STATUS.SCANNING);
  assert.equal(scanning[2].status, INVENTORY_STATUS.PENDING);
});

test('reconcileScan marks an exact high-confidence read as verified', () => {
  const [record] = createInventoryLedger({ episode: 3, targetMeta: { aisle: 'A02', bin: 'A02 · 020' } });
  const result = reconcileScan(record, { countedQty: record.expectedQty, confidence: .99, readAt: 12.5 });
  assert.equal(result.status, INVENTORY_STATUS.VERIFIED);
  assert.equal(result.variance, 0);
  assert.equal(result.anomaly, false);
  assert.equal(result.readAt, 12.5);
});

test('reconcileScan flags a quantity mismatch as an exception', () => {
  const [record] = createInventoryLedger({ episode: 4, targetMeta: { aisle: 'A03', bin: 'A03 · 021' } });
  const result = reconcileScan(record, { countedQty: record.expectedQty - 2, confidence: .96 });
  assert.equal(result.status, INVENTORY_STATUS.EXCEPTION);
  assert.equal(result.variance, -2);
  assert.equal(result.anomaly, true);
});

test('inventoryReading is reproducible and keeps simulated readings within safe bounds', () => {
  const input = { episode: 21, index: 0, layoutId: 'cross', expectedQty: 28 };
  const first = inventoryReading(input);
  const second = inventoryReading(input);
  assert.deepEqual(first, second);
  assert.ok(first.countedQty >= 0);
  assert.ok(first.countedQty <= input.expectedQty);
  assert.ok(first.confidence >= 0 && first.confidence <= 1);
});

test('inventorySummary reports units, variance, accuracy and exception count', () => {
  const ledger = createInventoryLedger({ episode: 8, targetMeta: { aisle: 'A04', bin: 'A04 · 030' } });
  const first = reconcileScan(ledger[0], { countedQty: ledger[0].expectedQty, confidence: .99 });
  const second = reconcileScan(ledger[1], { countedQty: ledger[1].expectedQty - 2, confidence: .92 });
  const summary = inventorySummary([first, second, ledger[2]]);
  assert.equal(summary.binsTotal, 3);
  assert.equal(summary.binsScanned, 2);
  assert.equal(summary.verified, 1);
  assert.equal(summary.exceptions, 1);
  assert.equal(summary.varianceUnits, -2);
  assert.equal(summary.absoluteVariance, 2);
  assert.ok(summary.accuracy > 0 && summary.accuracy < 1);
  assert.ok(summary.confidence > .9 && summary.confidence < 1);
});

test('inventoryStatusLabel uses operator-facing labels', () => {
  assert.equal(inventoryStatusLabel(INVENTORY_STATUS.PENDING), 'QUEUED');
  assert.equal(inventoryStatusLabel(INVENTORY_STATUS.SCANNING), 'SCANNING');
  assert.equal(inventoryStatusLabel(INVENTORY_STATUS.VERIFIED), 'VERIFIED');
  assert.equal(inventoryStatusLabel(INVENTORY_STATUS.EXCEPTION), 'EXCEPTION');
  assert.equal(inventoryStatusLabel('unknown'), 'QUEUED');
});

