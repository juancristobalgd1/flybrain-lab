# FlyBrain Drone Lab

An interactive, public 3D laboratory for testing a **Drosophila-connectome-inspired spiking controller** on a simulated drone.

## Live preview

https://juancristobalgd1.github.io/flybrain-lab/

The page runs entirely in the browser. Three.js renders the world, a Web Worker executes a sparse 512-neuron LIF reservoir, and the motor readout updates from step rewards. The learned readout is checkpointed in `localStorage` so a returning browser can continue from its last completed mission.

## What is simulated

- 3D drone with thrust, yaw, drag, altitude and battery dynamics;
- beacon missions with deterministic episode targets;
- urban obstacles and six visualized lidar rays;
- 18 normalized sensor inputs (relative target, bearing, velocity, battery and lidar);
- six discrete motor outputs: forward, yaw left/right, climb, descend and hover;
- reward-modulated eligibility updates on the motor adapter;
- train/test episode split, success curve and live spike telemetry;
- chase, orbit and map camera modes, responsive on mobile.

## Scientific boundary

This is an executable sparse-spiking **proxy** inspired by the architecture of the MaleCNS project. It does not claim to run the complete 166,700-neuron biological connectome, nor does it guarantee flight performance or profitability. The fixed reservoir, reward rule and simplifications are intentionally visible so the experiment can be measured and replaced incrementally.

## Run locally

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.

## Structure

- `index.html` — public 3D lab interface.
- `app.js` — Three.js scene, flight dynamics, sensors, missions and telemetry.
- `drone-brain-worker.js` — sparse LIF reservoir and reward-modulated motor learning.
- `lib/drone-core.mjs` — pure geometry, target and reward functions.
- `tests/drone-core.test.mjs` — deterministic invariants.
- `trading.html` — archived paper-trading experiment kept for comparison.

## License

MIT
