import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { ACTIONS, distance3, successRate, warehouseTargetForEpisode } from './lib/drone-core.mjs';

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
  scanned: 0,
  anomalies: 0,
  targetMeta: null,
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
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
  new THREE.LineDashedMaterial({ color: '#64dcff', dashSize: .7, gapSize: .45, transparent: true, opacity: .68 }),
);
routeLine.computeLineDistances();
scene.add(routeLine);

const sensorGroup = new THREE.Group();
const sensorLines = [];
for (let i = 0; i < 6; i += 1) {
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
  state.scanned = 0;
  state.anomalies = state.episode % 9 === 0 ? 1 : 0;
  state.seed = (state.episode * 104729 + 7919) >>> 0;
  state.targetMeta = missionTarget();
  drone.target.set(state.targetMeta.x, state.targetMeta.y, state.targetMeta.z);
  drone.p.set(-31, 3.2, state.targetMeta.z > 0 ? 6 : -6);
  drone.v.set(0, 0, 0);
  drone.yaw = 0;
  drone.collision = false;
  pendingAction = 5;
  state.initialDistance = distance3(drone.p, drone.target);
  targetGroup.position.copy(drone.target);
  targetRing.scale.setScalar(1);
  $('episode').textContent = state.episode.toLocaleString();
  $('phase').textContent = state.episode % 10 === 0 ? 'TEST' : 'TRAIN';
  $('seed').textContent = state.seed;
  $('missionTarget').textContent = `BIN ${state.targetMeta.bin}`;
  $('aisle').textContent = `AISLE ${state.targetMeta.aisle}`;
  $('missionLabel').textContent = state.difficulty === 'hard' ? 'EXCEPTION SWEEP' : 'CYCLE COUNT';
  $('flightMode').textContent = state.difficulty === 'easy' ? 'OPEN AISLE' : state.difficulty === 'hard' ? 'DENSE STORAGE' : 'AISLE FOLLOW';
  renderQueue();
  log(`Mission ready · ${state.targetMeta.aisle} · ${state.targetMeta.bin}`);
  localStorage.setItem(storage.episode, state.episode);
}

function lidar() {
  return sensorLines.map((line, index) => {
    const angle = drone.yaw + (index - 2.5) * Math.PI / 5;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    let hit = 12;
    for (const obstacle of obstacles) {
      const nearX = Math.abs(obstacle.x - drone.p.x - dx * 3);
      const nearZ = Math.abs(obstacle.z - drone.p.z - dz * 3);
      if (nearX < obstacle.w / 2 + 2 && nearZ < obstacle.d / 2 + 2) {
        hit = Math.min(hit, Math.max(.6, Math.hypot(obstacle.x - drone.p.x, obstacle.z - drone.p.z) - Math.max(obstacle.w, obstacle.d) / 2));
      }
    }
    const points = line.geometry.attributes.position;
    points.setXYZ(0, drone.p.x, drone.p.y, drone.p.z);
    points.setXYZ(1, drone.p.x + dx * hit, drone.p.y, drone.p.z + dz * hit);
    points.needsUpdate = true;
    line.material.color.setHex(hit < 2 ? 0xff6874 : 0x64dcff);
    return Math.min(1, hit / 12);
  });
}

function features() {
  const dx = drone.target.x - drone.p.x;
  const dy = drone.target.y - drone.p.y;
  const dz = drone.target.z - drone.p.z;
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
    ...lidar(),
    state.collisions ? 1 : 0,
  ].slice(0, 18);
}

function teacher() {
  const dx = drone.target.x - drone.p.x;
  const dz = drone.target.z - drone.p.z;
  const bearing = Math.atan2(dz, dx);
  const angle = Math.atan2(Math.sin(bearing - drone.yaw), Math.cos(bearing - drone.yaw));
  if (lidar().some(value => value < .18)) return 3;
  if (Math.abs(angle) > .27) return angle > 0 ? 1 : 2;
  if (drone.target.y - drone.p.y > .8) return 3;
  if (drone.target.y - drone.p.y < -.8) return 4;
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
  drone.collision = drone.p.y < .72;
  if (drone.collision) {
    drone.p.y = .72;
    drone.v.multiplyScalar(-.25);
  }
  for (const obstacle of obstacles) {
    if (Math.abs(drone.p.x - obstacle.x) < obstacle.w / 2 + .65 && Math.abs(drone.p.z - obstacle.z) < obstacle.d / 2 + .65 && drone.p.y < obstacle.h + .5) {
      drone.collision = true;
      drone.v.multiplyScalar(-.35);
      state.collisions += 1;
    }
  }
  return drone.collision;
}

function updateRoute() {
  const distance = distance3(drone.p, drone.target);
  const progress = Math.max(0, Math.min(100, (1 - distance / Math.max(state.initialDistance, 1)) * 100));
  $('routeProgress').textContent = `${progress.toFixed(0)}%`;
  $('routeDetail').textContent = `${progress >= 90 ? 24 : Math.round(progress / 100 * 24)} / 24 scan points`;
  $('routeBar').style.width = `${progress}%`;
  $('coverage').textContent = `${progress.toFixed(0)}%`;
  $('distance').textContent = `${distance.toFixed(1)} m`;
  const bearing = THREE.MathUtils.radToDeg(Math.atan2(drone.target.z - drone.p.z, drone.target.x - drone.p.x) - drone.yaw);
  $('bearing').textContent = `bearing ${Math.round(bearing)}°`;
  $('clearance').textContent = `${(Math.min(...lidar()) * 12).toFixed(1)} m`;
  $('localization').textContent = `${Math.max(96, 99.4 - state.collisions * 1.4).toFixed(1)}%`;
  $('velocity').textContent = `${Math.hypot(drone.v.x, drone.v.z, drone.v.y).toFixed(1)} m/s`;
  const routePoints = routeLine.geometry.attributes.position;
  routePoints.setXYZ(0, drone.p.x, drone.p.y, drone.p.z);
  routePoints.setXYZ(1, drone.target.x, drone.target.y, drone.target.z);
  routePoints.needsUpdate = true;
  routeLine.computeLineDistances();
}

function updateUI(data) {
  const action = ACTIONS[data.action];
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
  brainCtx.lineWidth = .45;
  brainNodes.forEach((node, index) => {
    for (let edge = 1; edge < 3; edge += 1) {
      const other = brainNodes[(index * 17 + edge * 31) % brainNodes.length];
      brainCtx.strokeStyle = data.active.includes(index) ? '#c7ff4350' : '#6b879318';
      brainCtx.beginPath();
      brainCtx.moveTo(node.x, node.y);
      brainCtx.lineTo(other.x, other.y);
      brainCtx.stroke();
    }
  });
  brainNodes.forEach((node, index) => {
    const active = data.active.includes(index);
    const radius = active ? 1.7 + (index % 3) : .8;
    brainCtx.fillStyle = active ? (node.layer === 0 ? '#64dcff' : node.layer === 2 ? '#c7ff43' : '#a9b7bd') : '#49616d55';
    brainCtx.beginPath();
    brainCtx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    brainCtx.fill();
  });
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

const worker = new Worker('drone-brain-worker.js?v=2');
worker.onmessage = ({ data }) => {
  if (data.type === 'ready') {
    const checkpoint = readJson(storage.checkpoint, null);
    if (checkpoint) worker.postMessage({ type: 'restore', data: checkpoint });
    return;
  }
  if (data.type === 'restored') $('updates').textContent = data.updates.toLocaleString();
  if (data.type === 'checkpoint') localStorage.setItem(storage.checkpoint, JSON.stringify(data.data));
  if (data.type === 'decision') {
    pendingAction = data.action;
    updateUI(data);
  }
};
worker.postMessage({ type: 'init', seed: 381 });

function endMission(success) {
  state.successHistory.push(success);
  state.successHistory = state.successHistory.slice(-500);
  state.curve.push(successRate(state.successHistory));
  state.curve = state.curve.slice(-100);
  localStorage.setItem(storage.success, JSON.stringify(state.successHistory));
  localStorage.setItem(storage.curve, JSON.stringify(state.curve));
  state.scanned = success ? 1 : 0;
  renderQueue();
  worker.postMessage({ type: 'checkpoint' });
  log(success ? `✓ Scan verified · ${state.targetMeta.bin}` : `× Route timeout · ${state.targetMeta.bin}`);
  setTimeout(resetMission, 900);
}

function tick(dt) {
  if (!state.running) return;
  state.time += dt * state.speed;
  state.missionTime += dt * state.speed;
  decisionClock += dt * state.speed;
  const previousDistance = distance3(drone.p, drone.target);
  if (decisionClock > .12) {
    worker.postMessage({ type: 'step', features: features(), reward: state.lastStepReward, train: state.episode % 10 !== 0, teacher: teacher() });
    decisionClock = 0;
  }
  applyAction(pendingAction, dt * state.speed);
  const collision = checkCollision();
  const currentDistance = distance3(drone.p, drone.target);
  state.battery = Math.max(0, state.battery - dt * .0008);
  state.lastStepReward = (currentDistance < 1.15 ? 2 : 0) + (previousDistance - currentDistance) * .12 - (collision ? .8 : 0) - .001;
  state.reward += state.lastStepReward;
  setText('reward', state.reward.toFixed(3));
  $('success').textContent = `${(successRate(state.successHistory) * 100).toFixed(1)}%`;
  $('anomalies').textContent = state.anomalies;
  updateRoute();
  state.missionTime > 34 || state.battery <= 0 ? endMission(false) : currentDistance < 1.15 ? endMission(true) : null;
}

function animate(now) {
  const dt = Math.min(.05, (now - previousTime) / 1000);
  previousTime = now;
  tick(dt);
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
