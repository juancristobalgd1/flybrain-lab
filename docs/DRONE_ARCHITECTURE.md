# VYYQ warehouse autonomy architecture

```text
Warehouse digital twin
  ├─ rack rows + aisles + scan bins
  ├─ drone pose + flight dynamics + geofence
  ├─ lidar / IMU observation
  ├─ dock/aisle/scan/return waypoint planner
  └─ deterministic inventory evaluator
          ↓
  Web Worker: sparse LIF reservoir
          ↓
  six-action motor adapter
          ↓
  forward / yaw / climb / descend / hover
          ↓
  scan verification + route reward
```

The browser presents two views of the same episode. The operator sees a Three.js warehouse scene with a live route, racks, lidar rays and a scan beacon. The controller receives only normalized sensor values and never receives semantic DOM labels. The evaluator keeps the mission state privately so coverage, collision, battery and bin verification remain deterministic.

## P1 mission contract

An episode is no longer considered successful merely because the drone reaches a point. Each mission follows six deterministic checkpoints: `TAKEOFF`, `AISLE ENTRY`, `SCAN`, `AISLE EXIT`, `RETURN` and `DOCK`. The scan checkpoint requires the drone to be within 2.5 m of the bin, below 0.35 m/s, above 1.2 m of clearance and stable for two simulated seconds. Only after the scan is verified can the route return to the dock and close successfully. A geofence and collision edge detector apply a hover brake and record safety stops; a recovery assist is only allowed after three simulated seconds without meaningful progress and is also visible in telemetry.

The UI exposes `SCAN`, `AUTONOMY` and `SAFETY` telemetry so guided curriculum decisions are not confused with autonomous policy decisions. This remains a software-in-the-loop warehouse simulation; barcode/OCR, SLAM and physical flight-controller adapters are future stages.

The reservoir is built once from a deterministic seed so its topology stays stable across missions and checkpoint restores. At each decision, 18 normalized IMU/target/lidar values become Bernoulli input spikes; ten proxy ticks propagate activity through the sparse graph. The output with the largest motor readout is executed, with a decaying curriculum teacher during early training to keep the route solvable while the readout learns from reward-modulated eligibility.

The fixed graph is deliberately not presented as the full MaleCNS connectome. The next scientific step is to replace the generated reservoir with a compiled MaleCNS subgraph, preserve this observation/action protocol and compare it against this proxy and a frozen random control under identical warehouse missions.

## Episodic fast-weight navigation memory

The return leg now has a separate, small memory path around the spiking reservoir. It is
intentionally explicit so that the experiment can be measured and ablated:

```text
forward flight + IMU heading/speed
          ↓
  dopamine/write gate
          ↓
eight directional fast-weight columns
          ↓ decay every decision
  outbound vector → inverted home vector
          ↓ only after a verified scan
 bounded motor bias for forward / yaw / hover
```

`lib/fast-weight-memory.mjs` is pure and independent of Three.js. Each decision decays the
eight columns, then writes only when the drone is moving, the sensor signal is usable and the
write gate is open. The stored vector is converted to a homing vector by a 180° inversion. The
write is disabled after `SCAN VERIFIED`; the read is bounded and only active on the return leg,
so the memory cannot override collision, geofence or recovery safety logic. The worker reports writes, decay, vector magnitude,
confidence, gate state and read usage to the dashboard.

This is an engineering approximation of the fast-weight idea shown in the referenced fly-
connectome simulation, not a claim that the current 512-neuron proxy contains the biological
hΔ circuits. The UI labels the phases as `DOPAMINE WRITE`, `HOMING READ` and `RESET READY` so
operators can see when the memory is actually affecting the controller.

### Learning and safety checks

- The memory is reset at the start of every mission; learned motor readout weights remain
  checkpointable across episodes.
- Memory decay prevents an old route from becoming permanent. The home vector is telemetry and a
  bounded policy bias, not a replacement for lidar, geofence braking or scan verification.
- The first production experiment should run three identical cohorts: fast-weight enabled,
  fast-weight ablated and frozen-random control. Compare dock success, collision stops, battery
  margin, route length and return error before changing the gain or decay constants.
