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
