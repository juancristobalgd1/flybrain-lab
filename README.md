# VYYQ Warehouse Autonomy

An interactive warehouse digital twin for testing a **Drosophila-connectome-inspired spiking controller** on an autonomous inventory drone.

## Live preview

https://juancristobalgd1.github.io/flybrain-lab/

The page runs in the browser. Three.js renders a warehouse with rack rows, aisles, scan locations and a flying drone. A Web Worker executes a sparse 512-neuron LIF reservoir; its motor readout adapts from mission rewards and is checkpointed in `localStorage`.

Append `?fresh=1` to the preview URL for a reproducible clean run. Without that parameter, episode history and learned readout weights remain persistent in the browser.

## What is simulated

- warehouse digital twin with five rack rows, shelves, cartons, dock and aisle guidance;
- autonomous drone flight with thrust, yaw, altitude, drag, geofence and battery dynamics;
- deterministic cycle-count missions targeting aisle/bin locations;
- waypoint route from dock → aisle entry → scan → aisle exit → return → dock;
- IMU plus six horizontal and two vertical lidar rays for clearance and obstacle avoidance;
- 18 normalized sensor inputs and six motor outputs: forward, yaw left/right, climb, descend and hover;
- stationary scan verification (position, velocity, clearance and dwell time), scan queue, anomaly flag and mission-success telemetry;
- geofence brake, collision edge detection and return-to-dock completion gate;
- reward-modulated eligibility updates on the motor adapter;
- train/test episode split, learning curve, autonomous-vs-guided rate, chase/orbit/map cameras and responsive mobile UI.

## Scientific boundary

This is an executable sparse-spiking **proxy** inspired by the MaleCNS project. It does not claim to run the complete 166,700-neuron biological connectome. The warehouse, flight dynamics and inventory counts are deterministic simulations; no physical drone or warehouse system is connected.

## Run locally

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.

## Structure

- `index.html` — VYYQ operations dashboard and warehouse telemetry UI.
- `app.js` — Three.js warehouse scene, flight dynamics, sensors and mission state.
- `drone-brain-worker.js` — sparse LIF reservoir and reward-modulated motor learning.
- `lib/drone-core.mjs` — pure geometry, target, reward and warehouse mission functions.
- `tests/drone-core.test.mjs` — deterministic invariants.
- `trading.html` — archived paper-trading experiment kept for comparison.

## License

MIT
