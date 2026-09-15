// Deterministic inventory ledger for the warehouse digital twin.
//
// The browser simulation deliberately keeps this module free of DOM, Three.js and
// network state. That gives us one accounting contract that can later be reused by
// a barcode/RGB-D adapter or a WMS connector without changing mission logic.

export const INVENTORY_STATUS = Object.freeze({
  PENDING: 'PENDING',
  SCANNING: 'SCANNING',
  VERIFIED: 'VERIFIED',
  EXCEPTION: 'EXCEPTION',
});

const STATUS_VALUES = new Set(Object.values(INVENTORY_STATUS));

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashNumber(...parts) {
  let hash = 2166136261;
  for (const part of parts) {
    const text = String(part);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 12409;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function binNumber(targetMeta, index) {
  const match = String(targetMeta?.bin || '').match(/(\d{1,4})\s*$/);
  const base = match ? Number(match[1]) : 14;
  return (Number.isFinite(base) ? base : 14) + index;
}

function aisleFor(targetMeta) {
  return targetMeta?.aisle || 'OPEN';
}

function targetKey(targetMeta) {
  if (!targetMeta?.custom) return targetMeta?.bin || 'A03 · 014';
  return `CLICK:${Number(targetMeta.x || 0).toFixed(1)}:${Number(targetMeta.z || 0).toFixed(1)}`;
}

function statusOf(status) {
  return STATUS_VALUES.has(status) ? status : INVENTORY_STATUS.PENDING;
}

export function createInventoryLedger({ episode = 0, layoutId = 'standard', targetMeta = null, queueSize = 3 } = {}) {
  const size = Math.max(1, Math.min(12, Math.floor(queueSize)));
  const aisle = aisleFor(targetMeta);
  const target = targetKey(targetMeta);
  return Array.from({ length: size }, (_, index) => {
    const number = binNumber(targetMeta, index);
    const code = `${aisle}-${String(number).padStart(3, '0')}`;
    const hash = hashNumber(episode, layoutId, target, index);
    const expectedQty = 12 + (hash % 20);
    const sku = `VYYQ-${String((hash % 900) + 100).padStart(3, '0')}`;
    return {
      id: code,
      aisle,
      bin: targetMeta?.custom && index === 0 ? `CLICK · ${Number(targetMeta.x).toFixed(1)} / ${Number(targetMeta.z).toFixed(1)}` : code,
      sku,
      description: index === 0 ? 'mission target' : 'next cycle-count location',
      expectedQty,
      countedQty: null,
      variance: null,
      confidence: 0,
      status: INVENTORY_STATUS.PENDING,
      anomaly: false,
      readAt: null,
    };
  });
}

export function markScanning(records, index = 0) {
  return records.map((record, current) => current === index && record.countedQty === null
    ? { ...record, status: INVENTORY_STATUS.SCANNING }
    : record);
}

export function inventoryReading({ episode = 0, index = 0, layoutId = 'standard', expectedQty = 0, forcedAnomaly = false } = {}) {
  const anomaly = Boolean(forcedAnomaly) || hashNumber(episode, layoutId, index, 'read') % 11 === 0;
  const rawVariance = anomaly ? -Math.max(1, (hashNumber(episode, index, layoutId, 'variance') % 3) + 1) : 0;
  const countedQty = Math.max(0, Math.round(Number(expectedQty) || 0) + rawVariance);
  return {
    countedQty,
    confidence: anomaly ? .91 : .985,
    anomaly,
    variance: countedQty - (Number(expectedQty) || 0),
  };
}

export function reconcileScan(record, reading = {}) {
  const expectedQty = Math.max(0, Math.round(Number(record?.expectedQty) || 0));
  const countedQty = Math.max(0, Math.round(Number(reading.countedQty) || 0));
  const confidence = clamp(Number(reading.confidence) || 0, 0, 1);
  const variance = countedQty - expectedQty;
  const anomaly = Boolean(reading.anomaly) || variance !== 0 || confidence < .95;
  return {
    ...record,
    expectedQty,
    countedQty,
    variance,
    confidence,
    anomaly,
    status: anomaly ? INVENTORY_STATUS.EXCEPTION : INVENTORY_STATUS.VERIFIED,
    readAt: reading.readAt ?? null,
  };
}

export function inventorySummary(records = []) {
  const valid = records.filter(Boolean);
  const scanned = valid.filter(record => record.countedQty !== null && record.countedQty !== undefined);
  const exceptions = scanned.filter(record => record.status === INVENTORY_STATUS.EXCEPTION || record.anomaly || record.variance !== 0);
  const expectedUnits = scanned.reduce((sum, record) => sum + Math.max(0, Number(record.expectedQty) || 0), 0);
  const countedUnits = scanned.reduce((sum, record) => sum + Math.max(0, Number(record.countedQty) || 0), 0);
  const varianceUnits = countedUnits - expectedUnits;
  const absoluteVariance = scanned.reduce((sum, record) => sum + Math.abs(Number(record.variance) || 0), 0);
  const confidence = scanned.length ? scanned.reduce((sum, record) => sum + (Number(record.confidence) || 0), 0) / scanned.length : 0;
  return {
    binsTotal: valid.length,
    binsScanned: scanned.length,
    verified: scanned.filter(record => record.status === INVENTORY_STATUS.VERIFIED).length,
    exceptions: exceptions.length,
    expectedUnits,
    countedUnits,
    varianceUnits,
    absoluteVariance,
    accuracy: expectedUnits ? clamp(1 - absoluteVariance / expectedUnits, 0, 1) : 0,
    confidence,
  };
}

export function inventoryStatusLabel(status) {
  switch (statusOf(status)) {
    case INVENTORY_STATUS.SCANNING: return 'SCANNING';
    case INVENTORY_STATUS.VERIFIED: return 'VERIFIED';
    case INVENTORY_STATUS.EXCEPTION: return 'EXCEPTION';
    default: return 'QUEUED';
  }
}

