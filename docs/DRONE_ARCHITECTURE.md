# Drone experiment architecture

```text
Three.js world
  ├─ drone pose + obstacles + beacon
  ├─ lidar / IMU observation
  └─ reward evaluator
          ↓
  Web Worker: sparse LIF reservoir
          ↓
  six-action motor adapter
          ↓
  thrust / yaw / climb / hover
```

The reservoir is built once from a deterministic seed so its topology stays stable across missions and checkpoint restores. Episode seeds only change the world target and state noise. At each decision, normalized sensor values become Bernoulli input spikes; ten 1 ms proxy ticks propagate activity through the sparse graph. The output with the largest motor readout is executed, with a small curriculum teacher during early training to keep the demonstration moving while the readout learns.

The fixed graph is deliberately not presented as the full MaleCNS connectome. The next scientifically meaningful step is to replace the generated reservoir with a compiled MaleCNS subgraph, preserve this observation/action protocol, and compare it against this proxy and a frozen random control under identical missions.
