import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { ACTIONS, batteryDrain, distance3, planWarehouseRoute, rewardStep, routeProgress, scanReadiness, successRate, warehouseTargetForEpisode } from './lib/drone-core.mjs';

const $ = id => document.getElementById(id);
const setText = (id, value) => { const element = $(id); if (element) element.textContent = value; };
const world = $('viewport');
const brainCanvas = $('brain');
const chartCanvas = $('chart');
const params = new URLSearchParams(location.search);
const freshStart = params.get('fresh') === '1';
const storage = {
  episode: 'vyyq-drone-episode',
  success: 'vyyq-drone-success',
  curve: 'vyyq-drone-curve',
  checkpoint: 'vyyq-drone-checkpoint',
};

if (freshStart) {
  Object.values(storage).forEach(key => localStorage.removeItem(key));
}

const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};

const state = {
  running: true,
  speed: 3,
  difficulty: 'normal',
  episode: Number(localStorage.getItem(storage.episode) || 0),
  reward: 0,
  lastStepReward: 0,
  collisions: 0,
  successHistory: readJson(storage.success, []),
  curve: readJson(storage.curve, []),
  battery: 1,
  time: 0,
  missionTime: 0,
  seed: 381,
  initialDistance: 1,
  route: [],
  routeIndex: 0,
  scanIndex: 2,
  scanDwell: 0,
  scanConfirmed: false,
  scanConfidence: 0,
  scanned: 0,
  anomalies: 0,
  guidedDecisions: 0,
  autonomousDecisions: 0,
  safetyStops: 0,
  stallTime: 0,
  recoveryTime: 0,
  fastWeight: { vectorX: 0, vectorZ: 0, homeX: 0, homeZ: 0, magnitude: 0, heading: 0, confidence: 0, decay: 1, writeGate: false, dopamine: 0, returnMode: false, used: false, writes: 0, resets: 0, meanDelta: 0 },
  targetMeta: null,
  ending: false,
};

const drone = {
  p: new THREE.Vector3(-31, 3.2, 6),
  v: new THREE.Vector3(),
  yaw: 0,
  target: new THREE.Vector3(),
  collision: false,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color('#080e13');
scene.fog = new THREE.Fog('#080e13', 36, 112);
const camera = new THREE.PerspectiveCamera(54, 1, .1, 220);
camera.position.set(-37, 10, 14);

let renderer;
let renderSurface;
let fallbackCtx;
const probe = document.createElement('canvas');
const webglAvailable = !!(probe.getContext('webgl2') || probe.getContext('webgl'));
if (webglAvailable) {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderSurface = renderer.domElement;
    world.append(renderSurface);
  } catch { /* The 2D warehouse view below keeps telemetry usable. */ }
}
if (!renderer) {
  renderSurface = document.createElement('canvas');
  renderSurface.className = 'fallback-canvas';
  fallbackCtx = renderSurface.getContext('2d');
  world.append(renderSurface);
}

const controls = new OrbitControls(camera, renderSurface);
controls.enableDamping = true;
controls.enablePan = false;
controls.target.set(-5, 2, 0);
controls.maxPolarAngle = Math.PI * .47;
controls.minDistance = 7;
controls.maxDistance = 64;
controls.enabled = false;

scene.add(new THREE.HemisphereLight('#c8efff', '#17242d', 2.2));
const sun = new THREE.DirectionalLight('#d8f5ff', 3.3);
sun.position.set(-18, 24, 10);
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(132, 132),
  new THREE.MeshStandardMaterial({ color: '#0d171d', roughness: .88, metalness: .12 }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const grid = new THREE.GridHelper(132, 66, '#243640', '#111e25');
grid.position.y = .01;
grid.material.transparent = true;
grid.material.opacity = .42;
scene.add(grid);

const warehouseGroup = new THREE.Group();
const rackGroup = new THREE.Group();
const aisleGroup = new THREE.Group();
const lightGroup = new THREE.Group();
warehouseGroup.add(rackGroup, aisleGroup, lightGroup);
scene.add(warehouseGroup);

const rackFrame = new THREE.MeshStandardMaterial({ color: '#243943', metalness: .68, roughness: .32 });
const rackShelf = new THREE.MeshStandardMaterial({ color: '#394c54', metalness: .72, roughness: .3 });
const boxMaterials = [
  new THREE.MeshStandardMaterial({ color: '#b8c7c5', roughness: .72 }),
  new THREE.MeshStandardMaterial({ color: '#5d7780', roughness: .72 }),
  new THREE.MeshStandardMaterial({ color: '#a88962', roughness: .75 }),
  new THREE.MeshStandardMaterial({ color: '#45656d', roughness: .72 }),
];
const rackRows = [-24, -12, 0, 12, 24];
const aisleCenters = [-18, -6, 6, 18];
const obstacles = [];

function clearGroup(group) {
  while (group.children.length) group.remove(group.children[0]);
}

function addBox(group, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

function createRackRow(z, rowIndex) {
  const row = new THREE.Group();
  const bayWidth = 6.4;
  const depth = 2.7;
  const levels = [1.45, 3.15, 4.85];
  for (let x = -28; x <= 28; x += bayWidth) {
    const bay = Math.min(bayWidth, 56 - (x + 28));
    const center = x + bay / 2;
    [-bay / 2 + .12, bay / 2 - .12].forEach(offset => {
      addBox(row, new THREE.BoxGeometry(.16, 6.2, .16), rackFrame, center + offset, 3.1, z - depth / 2 + .12);
      addBox(row, new THREE.BoxGeometry(.16, 6.2, .16), rackFrame, center + offset, 3.1, z + depth / 2 - .12);
    });
    levels.forEach((level, levelIndex) => {
      addBox(row, new THREE.BoxGeometry(Math.max(1, bay - .16), .12, depth), rackShelf, center, level, z);
      const boxCount = 2 + ((rowIndex + levelIndex) % 2);
      for (let box = 0; box < boxCount; box += 1) {
        const boxWidth = .74 + ((box + levelIndex) % 2) * .18;
        const bx = center - (boxCount - 1) * .48 + box * .96;
        const bz = z + (rowIndex % 2 ? .56 : -.56);
        addBox(row, new THREE.BoxGeometry(boxWidth, .72, .82), boxMaterials[(rowIndex + levelIndex + box) % boxMaterials.length], bx, level + .43, bz);
      }
    });
    obstacles.push({ x: center, z, w: Math.max(1, bay - .22), d: depth, h: 6.2 });
  }
  rackGroup.add(row);
}

function createWarehouse() {
  clearGroup(rackGroup);
  clearGroup(aisleGroup);
  clearGroup(lightGroup);
  obstacles.length = 0;

  rackRows.forEach(createRackRow);
  aisleCenters.forEach((z, index) => {
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(56, .08),
      new THREE.MeshBasicMaterial({ color: index % 2 ? '#64dcff' : '#c7ff43', transparent: true, opacity: .4 }),
    );
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, .025, z);
    aisleGroup.add(stripe);
    for (let x = -25; x <= 25; x += 10) {
      addBox(aisleGroup, new THREE.BoxGeometry(4.2, .035, .16), new THREE.MeshBasicMaterial({ color: '#2b3d45' }), x, .045, z + 1.1);
    }
  });

  const dock = new THREE.Mesh(
    new THREE.BoxGeometry(7, .06, 6),
    new THREE.MeshBasicMaterial({ color: '#64dcff', transparent: true, opacity: .14 }),
  );
  dock.position.set(-32, .04, 6);
  aisleGroup.add(dock);
  const dockRing = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 2.35, 48),
    new THREE.MeshBasicMaterial({ color: '#64dcff', transparent: true, opacity: .62, side: THREE.DoubleSide }),
  );
  dockRing.rotation.x = -Math.PI / 2;
  dockRing.position.set(-32, .08, 6);
  aisleGroup.add(dockRing);

  for (let x = -24; x <= 24; x += 12) {
    for (const z of [-18, 6, 18]) {
      const luminaire = new THREE.Mesh(
        new THREE.BoxGeometry(4.4, .08, .18),
        new THREE.MeshBasicMaterial({ color: '#d8f5ff', transparent: true, opacity: .72 }),
      );
      luminaire.position.set(x, 8.4, z);
      lightGroup.add(luminaire);
    }
  }
}

createWarehouse();

const droneGroup = new THREE.Group();
scene.add(droneGroup);
const droneBody = new THREE.Mesh(
  new THREE.BoxGeometry(1.35, .28, .72),
  new THREE.MeshStandardMaterial({ color: '#18262e', metalness: .84, roughness: .24 }),
);
droneGroup.add(droneBody);
const droneNose = new THREE.Mesh(
  new THREE.BoxGeometry(.18, .12, .52),
  new THREE.MeshStandardMaterial({ color: '#c7ff43', emissive: '#456f00', emissiveIntensity: 1.3 }),
);
droneNose.position.set(.7, .02, 0);
droneGroup.add(droneNose);
const armMaterial = new THREE.MeshStandardMaterial({ color: '#8498a0', metalness: .9, roughness: .26 });
for (const z of [-.62, .62]) {
  for (const x of [-.52, .52]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(.9, .1, .1), armMaterial);
    arm.position.set(x, 0, z);
    arm.rotation.y = x * z > 0 ? -.5 : .5;
    droneGroup.add(arm);
    const prop = new THREE.Mesh(
      new THREE.TorusGeometry(.38, .025, 6, 28),
      new THREE.MeshBasicMaterial({ color: '#c7ff43', transparent: true, opacity: .72 }),
    );
    prop.rotation.x = Math.PI / 2;
    prop.position.set(x * 1.18, .06, z * 1.18);
    droneGroup.add(prop);
  }
}
const scanBeam = new THREE.Mesh(
  new THREE.CylinderGeometry(.06, .62, 2.6, 18, 1, true),
  new THREE.MeshBasicMaterial({ color: '#64dcff', transparent: true, opacity: .12, side: THREE.DoubleSide }),
);
scanBeam.position.y = -1.35;
droneGroup.add(scanBeam);

const targetGroup = new THREE.Group();
const targetCore = new THREE.Mesh(
  new THREE.IcosahedronGeometry(.48, 2),
  new THREE.MeshStandardMaterial({ color: '#c7ff43', emissive: '#456f00', emissiveIntensity: 2 }),
);
const targetRing = new THREE.Mesh(
  new THREE.TorusGeometry(1.08, .025, 8, 48),
  new THREE.MeshBasicMaterial({ color: '#c7ff43', transparent: true, opacity: .7 }),
);
targetRing.rotation.x = Math.PI / 2;
targetGroup.add(targetCore, targetRing);
scene.add(targetGroup);

let routeLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(Array.from({ length: 6 }, () => new THREE.Vector3())),
  new THREE.LineDashedMaterial({ color: '#64dcff', dashSize: .7, gapSize: .45, transparent: true, opacity: .68 }),
);
routeLine.computeLineDistances();
scene.add(routeLine);

const memoryArrow = new THREE.ArrowHelper(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(), 0, 0xffbf69, .5, .24);
memoryArrow.line.material.transparent = true;
memoryArrow.line.material.opacity = .86;
memoryArrow.cone.material.transparent = true;
memoryArrow.cone.material.opacity = .9;
memoryArrow.visible = false;
scene.add(memoryArrow);

const sensorGroup = new THREE.Group();
const sensorLines = [];
for (let i = 0; i < 8; i += 1) {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]),
    new THREE.LineBasicMaterial({ color: '#64dcff', transparent: true, opacity: .26 }),
  );
  sensorGroup.add(line);
  sensorLines.push(line);
}
scene.add(sensorGroup);

const brainCtx = brainCanvas.getContext('2d');
const chartCtx = chartCanvas.getContext('2d');
let brainNodes = [];
let pendingAction = 5;
let decisionClock = 0;
let previousTime = performance.now();
let workerInitialized = false;

function fit() {
  const bounds = world.getBoundingClientRect();
  if (renderer) renderer.setSize(bounds.width, bounds.height, false);
  else {
    const dpr = Math.min(devicePixelRatio, 2);
    renderSurface.width = bounds.width * dpr;
    renderSurface.height = bounds.height * dpr;
    fallbackCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  camera.aspect = bounds.width / bounds.height;
  camera.updateProjectionMatrix();
  const brainBounds = brainCanvas.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio, 2);
  brainCanvas.width = brainBounds.width * dpr;
  brainCanvas.height = brainBounds.height * dpr;
  brainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const chartBounds = chartCanvas.getBoundingClientRect();
  chartCanvas.width = chartBounds.width * dpr;
  chartCanvas.height = chartBounds.height * dpr;
  chartCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function missionTarget() {
  return warehouseTargetForEpisode(state.episode, state.difficulty);
}

function currentWaypoint() {
  return state.route[state.routeIndex] || state.route.at(-1) || drone.target;
}

function setMissionPhase() {
  const waypoint = currentWaypoint();
  setText('missionPhase', waypoint.phase || 'FLIGHT');
  setText('scanStatus', state.scanConfirmed ? 'SCAN VERIFIED' : state.routeIndex === state.scanIndex ? 'SCAN STANDBY' : 'TRANSIT');
  setText('safetyState', state.safetyStops ? `${state.safetyStops} STOPS` : 'ARMED');
}

function activateWaypoint() {
  const waypoint = currentWaypoint();
  drone.target.set(waypoint.x, waypoint.y, waypoint.z);
  setMissionPhase();
}

function updateMemoryVisual() {
  const memory = state.fastWeight;
  const direction = new THREE.Vector3(memory.homeX, 0, memory.homeZ);
  const length = Math.min(10, Math.max(0, memory.magnitude * .9));
  if (direction.lengthSq() < 1e-5 || length < .05) {
    memoryArrow.visible = false;
    return;
  }
  memoryArrow.visible = true;
  memoryArrow.position.copy(drone.p);
  memoryArrow.setDirection(direction.normalize());
  memoryArrow.setLength(length, .5, .24);
}

function updateFastWeightUI() {
  const memory = state.fastWeight;
  const degrees = THREE.MathUtils.radToDeg(memory.heading || 0);
  setText('homeVector', memory.magnitude > .05 ? `${memory.magnitude.toFixed(1)} m / ${Math.round(degrees)}°` : '—');
  setText('memoryWrites', memory.writes.toLocaleString());
  setText('memoryDecay', `${Math.round((memory.decay || 0) * 100)}%`);
  setText('homingConfidence', `${Math.round((memory.confidence || 0) * 100)}%`);
  const gate = memory.writeGate ? 'DOPAMINE WRITE' : memory.returnMode && memory.used ? 'HOMING READ' : memory.resets ? 'RESET READY' : 'STANDBY';
  setText('memoryGate', gate);
  const gateElement = $('memoryGate');
  if (gateElement) gateElement.style.color = memory.writeGate ? 'var(--amber)' : memory.returnMode && memory.used ? 'var(--lime)' : 'var(--cyan)';
  const bar = $('memoryBar');
  if (bar) bar.style.width = `${Math.min(100, memory.magnitude / 3 * 100)}%`;
  updateMemoryVisual();
}

function renderQueue() {
  const meta = state.targetMeta;
  const current = meta?.bin || 'A03 · 014';
  const base = Number(current.split('·').at(-1)?.trim() || 14);
  const rows = [0, 1, 2].map(index => {
    const label = `BIN ${meta?.aisle || 'A03'} · ${String(base + index).padStart(3, '0')}`;
    const status = index === 0 ? (state.scanned ? 'VERIFIED' : 'SCANNING') : 'QUEUED';
    return `<div><i class="${index === 0 && !state.scanned ? 'scanning' : ''}"></i><span>${label}</span><b>${status}</b></div>`;
  }).join('');
  $('inventoryRows').innerHTML = rows;
  $('queueCount').textContent = `${state.scanned ? '02' : '03'} OPEN`;
}

function resetMission() {
  state.episode += 1;
  state.reward = 0;
  state.lastStepReward = 0;
  state.collisions = 0;
  state.battery = 1;
  state.time = 0;
  state.missionTime = 0;
  state.routeIndex = 0;
  state.scanDwell = 0;
  state.scanConfirmed = false;
  state.scanConfidence = 0;
  state.scanned = 0;
  state.anomalies = state.episode % 9 === 0 ? 1 : 0;
  state.guidedDecisions = 0;
  state.autonomousDecisions = 0;
  state.safetyStops = 0;
  state.stallTime = 0;
  state.recoveryTime = 0;
  state.fastWeight = { ...state.fastWeight, vectorX: 0, vectorZ: 0, homeX: 0, homeZ: 0, magnitude: 0, heading: 0, confidence: 0, decay: 1, writeGate: false, dopamine: 0, returnMode: false, used: false, writes: 0, meanDelta: 0, resets: state.fastWeight.resets + 1 };
  state.ending = false;
  state.seed = (state.episode * 104729 + 7919) >>> 0;
  state.targetMeta = missionTarget();
  drone.p.set(-32, 3.2, 6);
  drone.v.set(0, 0, 0);
  drone.yaw = 0;
  drone.collision = false;
  pendingAction = 5;
  state.route = planWarehouseRoute(drone.p, state.targetMeta);
  state.initialDistance = distance3(drone.p, state.targetMeta);
  targetGroup.position.set(state.targetMeta.x, state.targetMeta.y, state.targetMeta.z);
  activateWaypoint();
  updateRouteGeometry();
  worker.postMessage({ type: workerInitialized ? 'reset' : 'init', seed: state.seed });
  workerInitialized = true;
  updateFastWeightUI();
  targetRing.scale.setScalar(1);
  $('episode').textContent = state.episode.toLocaleString();
  $('phase').textContent = state.episode % 10 === 0 ? 'TEST' : 'TRAIN';
  $('seed').textContent = state.seed;
  $('missionTarget').textContent = `BIN ${state.targetMeta.bin}`;
  $('aisle').textContent = `AISLE ${state.targetMeta.aisle}`;
  $('missionLabel').textContent = state.difficulty === 'hard' ? 'EXCEPTION SWEEP' : 'CYCLE COUNT';
  $('flightMode').textContent = state.difficulty === 'easy' ? 'OPEN AISLE' : state.difficulty === 'hard' ? 'DENSE STORAGE' : 'AISLE FOLLOW';
  renderQueue();
  log(`Mission ready · ${state.targetMeta.bin}`);
  localStorage.setItem(storage.episode, state.episode);
}

function lidar() {
  return sensorLines.map((line, index) => {
    const vertical = index >= 6;
    const angle = drone.yaw + (index - 2.5) * Math.PI / 5;
    const dx = vertical ? 0 : Math.cos(angle);
    const dz = vertical ? 0 : Math.sin(angle);
    let hit = vertical ? (index === 6 ? Math.max(.5, 10.5 - drone.p.y) : Math.max(.5, drone.p.y - .7)) : 12;
    if (!vertical) {
      for (let distance = .5; distance <= 12; distance += .25) {
        const blocked = obstacles.some(obstacle => Math.abs(obstacle.x - (drone.p.x + dx * distance)) < obstacle.w / 2 + .55 && Math.abs(obstacle.z - (drone.p.z + dz * distance)) < obstacle.d / 2 + .55 && drone.p.y < obstacle.h + .5);
        if (blocked) { hit = distance; break; }
      }
    }
    const points = line.geometry.attributes.position;
    points.setXYZ(0, drone.p.x, drone.p.y, drone.p.z);
    points.setXYZ(1, drone.p.x + dx * hit, vertical ? drone.p.y + (index === 6 ? hit : -hit) : drone.p.y, drone.p.z + dz * hit);
    points.needsUpdate = true;
    line.material.color.setHex(hit < 2 ? 0xff6874 : 0x64dcff);
    return Math.min(1, hit / 12);
  });
}

function features() {
  const waypoint = currentWaypoint();
  const dx = waypoint.x - drone.p.x;
  const dy = waypoint.y - drone.p.y;
  const dz = waypoint.z - drone.p.z;
  const bearing = Math.atan2(dz, dx);
  const angle = Math.atan2(Math.sin(bearing - drone.yaw), Math.cos(bearing - drone.yaw));
  return [
    (dx / 30 + 1) / 2,
    (dy / 12 + 1) / 2,
    (dz / 30 + 1) / 2,
    (Math.sin(angle) + 1) / 2,
    (Math.cos(angle) + 1) / 2,
    Math.min(1, Math.hypot(drone.v.x, drone.v.z) / 3),
    drone.v.y > 0 ? .7 : .3,
    state.battery,
    ...lidar().slice(0, 6),
    state.collisions ? 1 : 0,
  ].slice(0, 18);
}

function navigationObservation(dt) {
  const speed = Math.hypot(drone.v.x, drone.v.z);
  const heading = speed > .03 ? Math.atan2(drone.v.z, drone.v.x) : drone.yaw;
  const writeGate = speed > .03 && !drone.collision && state.recoveryTime <= 0;
  const sensorQuality = drone.collision ? .25 : state.recoveryTime ? .6 : 1;
  return {
    heading,
    speed,
    dt: Math.min(.5, Math.max(.02, dt)),
    dopamine: writeGate ? Math.min(1, speed / 1.2) * sensorQuality : 0,
    writeGate,
    yaw: drone.yaw,
    returnMode: state.scanConfirmed && state.routeIndex > state.scanIndex,
    memoryGain: state.recoveryTime ? .9 : .6,
  };
}

function teacher() {
  const waypoint = currentWaypoint();
  const dx = waypoint.x - drone.p.x;
  const dz = waypoint.z - drone.p.z;
  const bearing = Math.atan2(dz, dx);
  const angle = Math.atan2(Math.sin(bearing - drone.yaw), Math.cos(bearing - drone.yaw));
  if (waypoint.y - drone.p.y > .8) return 3;
  if (waypoint.y - drone.p.y < -.8) return 4;
  if (state.routeIndex === state.scanIndex && distance3(drone.p, waypoint) < 2.8) return 5;
  if (Math.abs(angle) > .27) return angle > 0 ? 1 : 2;
  if (lidar().slice(0, 6).some(value => value < .18) && drone.p.y < 6.5) return 3;
  return 0;
}

function applyAction(action, dt) {
  const thrust = state.difficulty === 'hard' ? 3.7 : state.difficulty === 'normal' ? 4.2 : 4.6;
  const forward = new THREE.Vector3(Math.cos(drone.yaw), 0, Math.sin(drone.yaw));
  if (action === 0) drone.v.addScaledVector(forward, thrust * dt);
  if (action === 1) drone.yaw += 1.8 * dt;
  if (action === 2) drone.yaw -= 1.8 * dt;
  if (action === 3) drone.v.y += thrust * .75 * dt;
  if (action === 4) drone.v.y -= thrust * .75 * dt;
  drone.v.multiplyScalar(Math.pow(.93, dt * 60));
  drone.v.y -= .35 * dt;
  drone.p.addScaledVector(drone.v, dt);
  drone.p.y = Math.max(.7, Math.min(10.5, drone.p.y));
  droneGroup.position.copy(drone.p);
  droneGroup.rotation.y = -drone.yaw;
  droneGroup.rotation.z = -drone.v.x * .025;
}

function checkCollision() {
  const wasColliding = drone.collision;
  let hit = drone.p.y < .72;
  if (hit) {
    drone.p.y = .72;
    drone.v.multiplyScalar(-.25);
  }
  for (const obstacle of obstacles) {
    if (Math.abs(drone.p.x - obstacle.x) < obstacle.w / 2 + .65 && Math.abs(drone.p.z - obstacle.z) < obstacle.d / 2 + .65 && drone.p.y < obstacle.h + .5) {
      hit = true;
      drone.v.multiplyScalar(-.35);
    }
  }
  drone.collision = hit;
  if (hit && !wasColliding) {
    state.collisions += 1;
    state.safetyStops += 1;
    pendingAction = 5;
  }
  return drone.collision;
}

function enforceGeofence() {
  const before = drone.p.clone();
  drone.p.x = Math.max(-33, Math.min(33, drone.p.x));
  drone.p.y = Math.max(.72, Math.min(10.5, drone.p.y));
  drone.p.z = Math.max(-29, Math.min(29, drone.p.z));
  if (!before.equals(drone.p)) {
    drone.v.multiplyScalar(.2);
    state.safetyStops += 1;
    pendingAction = 5;
  }
}

function updateRouteGeometry() {
  const points = routeLine.geometry.attributes.position;
  state.route.forEach((point, index) => points.setXYZ(index, index === 0 ? drone.p.x : point.x, index === 0 ? drone.p.y : point.y, index === 0 ? drone.p.z : point.z));
  for (let index = state.route.length; index < 6; index += 1) points.setXYZ(index, 0, 0, 0);
  points.needsUpdate = true;
  routeLine.computeLineDistances();
}

function advanceWaypointIfReady(navDistance) {
  const waypoint = currentWaypoint();
  if (state.routeIndex === state.scanIndex) return false;
  if (navDistance > (waypoint.phase === 'DOCK' ? .85 : 1.05) || state.routeIndex >= state.route.length - 1) return false;
  state.routeIndex += 1;
  activateWaypoint();
  return true;
}

function updateRoute() {
  const waypoint = currentWaypoint();
  const navDistance = distance3(drone.p, waypoint);
  const scanTarget = state.route[state.scanIndex] || state.targetMeta || waypoint;
  const distance = distance3(drone.p, scanTarget);
  const progress = routeProgress(drone.p, state.route, state.routeIndex) * 100;
  $('routeProgress').textContent = `${progress.toFixed(0)}%`;
  $('routeDetail').textContent = `${state.routeIndex} / ${Math.max(1, state.route.length - 1)} route checkpoints`;
  $('routeBar').style.width = `${progress}%`;
  $('coverage').textContent = `${progress.toFixed(0)}%`;
  $('distance').textContent = `${distance.toFixed(1)} m`;
  const bearingRad = Math.atan2(scanTarget.z - drone.p.z, scanTarget.x - drone.p.x) - drone.yaw;
  const bearing = THREE.MathUtils.radToDeg(Math.atan2(Math.sin(bearingRad), Math.cos(bearingRad)));
  $('bearing').textContent = `bearing ${Math.round(bearing)}°`;
  $('clearance').textContent = `${(Math.min(...lidar()) * 12).toFixed(1)} m`;
  $('localization').textContent = `${Math.max(96, 99.4 - state.collisions * 1.4).toFixed(1)}%`;
  $('velocity').textContent = `${Math.hypot(drone.v.x, drone.v.z, drone.v.y).toFixed(1)} m/s`;
  updateRouteGeometry();
  setMissionPhase();
  setText('scanConfidence', state.scanConfirmed ? 'VERIFIED' : `${Math.round(state.scanConfidence * 100)}%`);
  setText('autonomyRate', `${Math.round((state.autonomousDecisions / Math.max(1, state.autonomousDecisions + state.guidedDecisions)) * 100)}%`);
}

function updateUI(data) {
  const action = ACTIONS[data.action];
  if (data.guided) state.guidedDecisions += 1;
  else state.autonomousDecisions += 1;
  $('action').textContent = action;
  $('motorOutput').textContent = action;
  $('confidence').textContent = `confidence ${Math.round(Math.max(...data.probs) * 100)}%`;
  $('spikeRate').textContent = `${(data.spikes * 100).toLocaleString()} spikes/s`;
  $('updates').textContent = data.updates.toLocaleString();
  $('meanDelta').textContent = `mean Δ ${data.meanDelta.toFixed(6)}`;
  data.probs.forEach((probability, index) => { $(`p${index}`).style.width = `${Math.max(5, probability * 100)}%`; });
  setText('collisions', state.collisions);
  $('battery').textContent = `${Math.round(state.battery * 100)}%`;
  $('altitude').textContent = `altitude ${drone.p.y.toFixed(1)} m`;
  updateRoute();
  updateFastWeightUI();
  drawBrain(data);
}

function drawBrain(data) {
  const bounds = brainCanvas.getBoundingClientRect();
  const width = bounds.width;
  const height = bounds.height;
  brainCtx.clearRect(0, 0, width, height);
  if (!brainNodes.length) {
    brainNodes = Array.from({ length: 124 }, (_, index) => ({
      x: (Math.sin(index * 12.71) * .5 + .5) * width,
      y: (Math.cos(index * 5.37) * .5 + .5) * height,
      layer: index < 20 ? 0 : index > 105 ? 2 : 1,
    }));
  }
  const activeNodes = new Set(data.active.map(index => index % brainNodes.length));
  brainCtx.lineWidth = .45;
  brainNodes.forEach((node, index) => {
    for (let edge = 1; edge < 3; edge += 1) {
      const otherIndex = (index * 17 + edge * 31) % brainNodes.length;
      const other = brainNodes[otherIndex];
      const activeEdge = activeNodes.has(index) || activeNodes.has(otherIndex);
      brainCtx.strokeStyle = activeEdge ? '#c7ff43b0' : '#34505ccc';
      brainCtx.lineWidth = activeEdge ? .7 : .45;
      brainCtx.beginPath();
      brainCtx.moveTo(node.x, node.y);
      brainCtx.lineTo(other.x, other.y);
      brainCtx.stroke();
    }
  });
  brainNodes.forEach((node, index) => {
    const active = activeNodes.has(index);
    const radius = active ? 1.7 + (index % 3) : .8;
    brainCtx.fillStyle = active ? (node.layer === 0 ? '#64dcff' : node.layer === 2 ? '#c7ff43' : '#d3dde0') : '#6f8792cc';
    brainCtx.shadowBlur = active ? 7 : 0;
    brainCtx.shadowColor = node.layer === 0 ? '#64dcff' : '#c7ff43';
    brainCtx.beginPath();
    brainCtx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    brainCtx.fill();
  });
  brainCtx.shadowBlur = 0;
}

function drawChart() {
  const bounds = chartCanvas.getBoundingClientRect();
  const width = bounds.width;
  const height = bounds.height;
  chartCtx.clearRect(0, 0, width, height);
  const values = state.curve.slice(-100);
  if (values.length < 2) return;
  chartCtx.strokeStyle = '#c7ff43';
  chartCtx.lineWidth = 1.5;
  chartCtx.beginPath();
  values.forEach((value, index) => {
    const x = index / (values.length - 1) * width;
    const y = height - (value * .8 + .1) * height;
    index ? chartCtx.lineTo(x, y) : chartCtx.moveTo(x, y);
  });
  chartCtx.stroke();
}

function projectFallback(x, z, y, width, height) {
  return { x: width / 2 + x * 15 / (1 + Math.max(0, y) * .035), y: height * .68 + z * 11 / (1 + Math.max(0, y) * .035) - y * 16 };
}

function drawFallback() {
  const bounds = world.getBoundingClientRect();
  const width = bounds.width;
  const height = bounds.height;
  fallbackCtx.clearRect(0, 0, width, height);
  fallbackCtx.fillStyle = '#0d171d';
  fallbackCtx.fillRect(0, 0, width, height);
  const horizon = height * .36;
  fallbackCtx.strokeStyle = '#1b303a';
  fallbackCtx.lineWidth = 1;
  for (let i = -14; i <= 14; i += 1) {
    const x = width / 2 + i * 44;
    fallbackCtx.beginPath();
    fallbackCtx.moveTo(width / 2 + (x - width / 2) * .18, horizon);
    fallbackCtx.lineTo(x, height);
    fallbackCtx.stroke();
  }
  rackRows.forEach(z => {
    const row = projectFallback(0, z, 0, width, height);
    fallbackCtx.fillStyle = '#20353e';
    fallbackCtx.fillRect(70, row.y - 5, width - 140, 10);
    for (let level = 1; level < 5; level += 1) {
      fallbackCtx.fillStyle = level % 2 ? '#35505a' : '#2a424b';
      fallbackCtx.fillRect(82, row.y - level * 15, width - 164, 5);
    }
  });
  if (state.route.length > 1) {
    fallbackCtx.strokeStyle = '#64dcff99';
    fallbackCtx.lineWidth = 1.5;
    fallbackCtx.setLineDash([5, 5]);
    fallbackCtx.beginPath();
    state.route.forEach((point, index) => {
      const projected = projectFallback(point.x, point.z, point.y, width, height);
      index ? fallbackCtx.lineTo(projected.x, projected.y) : fallbackCtx.moveTo(projected.x, projected.y);
    });
    fallbackCtx.stroke();
    fallbackCtx.setLineDash([]);
  }
  const target = projectFallback(drone.target.x, drone.target.z, drone.target.y, width, height);
  fallbackCtx.strokeStyle = '#c7ff43';
  fallbackCtx.globalAlpha = .72;
  fallbackCtx.beginPath();
  fallbackCtx.arc(target.x, target.y, 22, 0, Math.PI * 2);
  fallbackCtx.stroke();
  fallbackCtx.globalAlpha = 1;
  fallbackCtx.fillStyle = '#c7ff43';
  fallbackCtx.beginPath();
  fallbackCtx.arc(target.x, target.y, 7, 0, Math.PI * 2);
  fallbackCtx.fill();
  const position = projectFallback(drone.p.x, drone.p.z, drone.p.y, width, height);
  if (state.fastWeight.magnitude > .05) {
    const home = projectFallback(drone.p.x + state.fastWeight.homeX * .7, drone.p.z + state.fastWeight.homeZ * .7, drone.p.y, width, height);
    fallbackCtx.strokeStyle = '#ffbf69cc';
    fallbackCtx.lineWidth = 2;
    fallbackCtx.beginPath();
    fallbackCtx.moveTo(position.x, position.y);
    fallbackCtx.lineTo(home.x, home.y);
    fallbackCtx.stroke();
  }
  fallbackCtx.save();
  fallbackCtx.translate(position.x, position.y);
  fallbackCtx.rotate(-drone.yaw);
  fallbackCtx.fillStyle = '#e5eef0';
  fallbackCtx.fillRect(-18, -5, 36, 10);
  fallbackCtx.strokeStyle = '#64dcff';
  fallbackCtx.strokeRect(-18, -5, 36, 10);
  fallbackCtx.restore();
  fallbackCtx.fillStyle = '#82939b';
  fallbackCtx.font = '10px ui-monospace,monospace';
  fallbackCtx.fillText('WEBGL UNAVAILABLE · 2D WAREHOUSE VIEW', 17, 76);
}

function log(message) {
  const entry = document.createElement('p');
  entry.innerHTML = `<time>${new Date().toISOString().slice(11, 19)}</time>${message}`;
  $('eventLog').prepend(entry);
  while ($('eventLog').children.length > 5) $('eventLog').lastChild.remove();
}

function updateScan(dt) {
  if (state.routeIndex !== state.scanIndex || state.scanConfirmed) return false;
  const distance = distance3(drone.p, currentWaypoint());
  const speed = drone.v.length();
  const clearance = Math.min(...lidar().map(value => value * 12));
  const simulationStep = dt * state.speed;
  let readiness = scanReadiness({ distance, speed, clearance, dwell: state.scanDwell });
  if (readiness.inPosition && readiness.stable && readiness.safe) {
    state.scanDwell = Math.min(2, state.scanDwell + simulationStep);
  } else {
    state.scanDwell = Math.max(0, state.scanDwell - simulationStep * .5);
  }
  readiness = scanReadiness({ distance, speed, clearance, dwell: state.scanDwell });
  state.scanConfidence = readiness.inPosition ? readiness.progress : 0;
  if (!readiness.ready) return false;
  state.scanConfirmed = true;
  state.scanned = 1;
  state.scanConfidence = 1;
  renderQueue();
  setText('scanned', state.scanned);
  log(`✓ Scan verified · ${state.targetMeta.bin}`);
  state.routeIndex += 1;
  activateWaypoint();
  return true;
}

const worker = new Worker('drone-brain-worker.js?v=3', { type: 'module' });
worker.onmessage = ({ data }) => {
  if (data.type === 'ready') {
    state.fastWeight = { ...state.fastWeight, ...data.fastWeight };
    updateFastWeightUI();
    const checkpoint = readJson(storage.checkpoint, null);
    if (checkpoint) worker.postMessage({ type: 'restore', data: checkpoint });
    return;
  }
  if (data.type === 'restored') $('updates').textContent = data.updates.toLocaleString();
  if (data.type === 'checkpoint') localStorage.setItem(storage.checkpoint, JSON.stringify(data.data));
  if (data.type === 'decision') {
    pendingAction = data.action;
    state.fastWeight = { ...state.fastWeight, ...data.fastWeight };
    updateUI(data);
  }
};

function endMission(success) {
  if (state.ending) return;
  state.ending = true;
  state.successHistory.push(success);
  state.successHistory = state.successHistory.slice(-500);
  state.curve.push(successRate(state.successHistory));
  state.curve = state.curve.slice(-100);
  localStorage.setItem(storage.success, JSON.stringify(state.successHistory));
  localStorage.setItem(storage.curve, JSON.stringify(state.curve));
  state.scanned = success ? 1 : 0;
  renderQueue();
  setText('scanned', state.scanned);
  drawChart();
  worker.postMessage({ type: 'checkpoint' });
  log(success ? `✓ Mission docked · ${state.targetMeta.bin}` : `× Route timeout · ${state.targetMeta.bin}`);
  setTimeout(resetMission, 900);
}

function tick(dt) {
  if (!state.running) return;
  state.time += dt * state.speed;
  state.missionTime += dt * state.speed;
  decisionClock += dt * state.speed;
  const previousDistance = distance3(drone.p, currentWaypoint());
  if (decisionClock > .12) {
    worker.postMessage({ type: 'step', features: features(), reward: state.lastStepReward, train: state.episode % 10 !== 0, teacher: teacher(), navigation: navigationObservation(decisionClock) });
    decisionClock = 0;
  }
  if (state.recoveryTime > 0) pendingAction = teacher();
  applyAction(pendingAction, dt * state.speed);
  enforceGeofence();
  const collision = checkCollision();
  const simDt = dt * state.speed;
  const currentDistance = distance3(drone.p, currentWaypoint());
  if (!collision && currentDistance > 1.2 && previousDistance - currentDistance < .015) state.stallTime += simDt;
  else state.stallTime = Math.max(0, state.stallTime - simDt * .5);
  if (state.stallTime > 3) {
    const recovery = teacher();
    pendingAction = recovery;
    state.recoveryTime = 4;
    state.safetyStops += 1;
    log(`Safety assist · ${currentWaypoint().phase}`);
    state.stallTime = 0;
  }
  state.recoveryTime = Math.max(0, state.recoveryTime - simDt);
  const reached = advanceWaypointIfReady(currentDistance);
  const scanCompleted = updateScan(dt);
  const batteryBefore = state.battery;
  state.battery = Math.max(0, state.battery - batteryDrain({ dt: simDt, speed: drone.v.length(), altitude: drone.p.y, payload: state.anomalies ? .5 : 0 }));
  state.lastStepReward = rewardStep({ previousDistance, distance: currentDistance, collision, reached: reached || scanCompleted, batteryUsed: batteryBefore - state.battery });
  if (scanCompleted) state.lastStepReward += .25;
  state.reward += state.lastStepReward;
  setText('reward', state.reward.toFixed(3));
  $('success').textContent = `${(successRate(state.successHistory) * 100).toFixed(1)}%`;
  $('anomalies').textContent = state.anomalies;
  updateRoute();
  const atDock = state.routeIndex === state.route.length - 1 && distance3(drone.p, currentWaypoint()) <= .85;
  if (!state.ending && state.scanConfirmed && atDock) endMission(true);
  else if (!state.ending && (state.missionTime > 120 || state.battery <= 0)) endMission(false);
}

function animate(now) {
  const dt = Math.min(.05, (now - previousTime) / 1000);
  previousTime = now;
  tick(dt);
  updateMemoryVisual();
  if ($('cameraLabel').textContent === 'CHASE VIEW') {
    const offset = new THREE.Vector3(-Math.cos(drone.yaw) * 9, 5.6, -Math.sin(drone.yaw) * 9);
    camera.position.lerp(drone.p.clone().add(offset), .06);
    controls.target.lerp(drone.p, .08);
  }
  controls.update();
  if (renderer) renderer.render(scene, camera); else drawFallback();
  requestAnimationFrame(animate);
}

$('toggle').onclick = () => {
  state.running = !state.running;
  $('toggle').innerHTML = state.running ? 'Ⅱ&nbsp;&nbsp; PAUSE' : '▶&nbsp;&nbsp; RESUME';
  $('runStatus').textContent = state.running ? 'AUTONOMY ONLINE' : 'TRAINING PAUSED';
};
$('reset').onclick = resetMission;
$('speed').oninput = event => { state.speed = +event.target.value; $('speedOut').textContent = `${state.speed}×`; };
$('difficulty').onchange = event => { state.difficulty = event.target.value; createWarehouse(); resetMission(); };
document.querySelectorAll('[data-camera]').forEach(button => button.onclick = () => {
  document.querySelectorAll('[data-camera]').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  const mode = button.dataset.camera;
  if (mode === 'orbit') {
    controls.enabled = true;
    $('cameraLabel').textContent = 'ORBIT VIEW';
  } else if (mode === 'top') {
    controls.enabled = true;
    camera.position.set(0, 45, .1);
    controls.target.copy(drone.p);
    $('cameraLabel').textContent = 'MAP VIEW';
  } else {
    controls.enabled = false;
    $('cameraLabel').textContent = 'CHASE VIEW';
  }
});

addEventListener('resize', fit);
fit();
resetMission();
drawChart();
requestAnimationFrame(animate);
