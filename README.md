# VYYQ Warehouse Autonomy

An interactive warehouse digital twin for testing a **Drosophila-connectome-inspired spiking controller** on an autonomous inventory drone.

## Live preview

https://juancristobalgd1.github.io/flybrain-lab/

The page runs in the browser. Three.js renders a warehouse with rack rows, aisles, scan locations and a flying drone. A Web Worker executes a sparse 512-neuron LIF reservoir; its motor readout adapts from mission rewards and is checkpointed in `localStorage`.

Append `?fresh=1` to the preview URL for a reproducible clean run. Without that parameter, episode history and learned readout weights remain persistent in the browser.

## What is simulated

- warehouse digital twin with switchable rack-grid, cross-aisle, narrow-maze, open-floor and dense-storage layouts;
- autonomous drone flight with thrust, yaw, altitude, drag, geofence and battery dynamics;
- deterministic cycle-count missions targeting aisle/bin locations;
- waypoint route from dock → aisle entry → scan → aisle exit → return → dock;
- IMU plus six horizontal and two vertical lidar rays for clearance and obstacle avoidance;
- 18 normalized sensor inputs and six motor outputs: forward, yaw left/right, climb, descend and hover;
- stationary scan verification (position, velocity, clearance and dwell time), an autonomous inventory ledger, deterministic quantity reconciliation, exception queue and mission-success telemetry;
- geofence brake, collision edge detection and return-to-dock completion gate;
- reward-modulated eligibility updates on the motor adapter;
- episodic directional fast-weight memory: a dopamine-gated outbound write, continuous decay and a bounded homing read during the return leg;
- operator test controls: change the warehouse geometry without leaving the page, or enable `SELECT LOCATION` and click any safe point in the 3D floor to re-plan a mission toward it;
- operator-grade inventory KPIs: SKU/bin identity, expected versus counted units, variance, confidence, accuracy and an explicit `VERIFIED`/`EXCEPTION` state for every read;
- train/test episode split, learning curve, autonomous-vs-guided rate, chase/orbit/map cameras and responsive mobile UI.

## Scientific boundary

This is an executable sparse-spiking **proxy** inspired by the MaleCNS project. It does not claim to run the complete 166,700-neuron biological connectome. The fast-weight module is a computational hypothesis inspired by the hΔH/hΔA/hΔI/hΔG/hΔM discussion: it stores a short-lived directional vector and exposes it to the motor adapter, but it is not a validated biological emulation. The warehouse, flight dynamics and inventory counts are deterministic simulations; the inventory ledger is the contract to replace with barcode/RGB-D/OCR readings and a WMS adapter before any physical deployment. No physical drone or warehouse system is connected.

## Run locally

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.

## Structure

- `index.html` — VYYQ operations dashboard and warehouse telemetry UI.
- `app.js` — Three.js warehouse scene, flight dynamics, sensors and mission state.
- `drone-brain-worker.js` — sparse LIF reservoir, reward-modulated motor learning and fast-weight navigation memory.
- `lib/drone-core.mjs` — pure geometry, target, reward and warehouse mission functions.
- `lib/fast-weight-memory.mjs` — pure directional store, decay, home-vector inversion and bounded motor bias.
- `lib/warehouse-layouts.mjs` — deterministic warehouse geometries and layout-aware target generation.
- `lib/inventory-core.mjs` — pure inventory ledger, scan reconciliation, quantity variance and KPI aggregation.
- `tests/drone-core.test.mjs` — deterministic invariants.
- `tests/fast-weight-memory.test.mjs` — write-gate, decay, inversion, reset and policy-read invariants.
- `tests/inventory-core.test.mjs` — deterministic ledger, scan state, quantity variance, exception and accuracy invariants.
- `trading.html` — archived paper-trading experiment kept for comparison.

## License

MIT
