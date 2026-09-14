# FlyBrain Lab

An interactive public visualization of the proposed **MaleCNS → spiking neural network → browser** experiment.

## FlyBrain Trader

`trading.html` adds a conservative US-equities research environment:

- deterministic synthetic regime market;
- executable sparse LIF spiking policy in a Web Worker;
- BUY / HOLD / SELL with costs and slippage proxy;
- independent 5% maximum-drawdown hard stop;
- a server-only, paper-only Interactive Brokers adapter with live capital
  deliberately unimplemented.

Synthetic profitability is not evidence of live profitability. See
`docs/TRADING_ARCHITECTURE.md` for the promotion gates.

The preview makes the training loop observable: synthetic neural activity, browser actions, episodic rewards, success rate, deterministic seeds and a visuomotor test world. It is deliberately dependency-free so the complete demo runs as a static GitHub Pages site.

> This first public preview is a systems simulation, not a scientific claim or a full MaleCNS execution. The next engineering milestone is to connect the UI telemetry protocol to a real sparse SNN backend.

## Architecture

```text
Browser pixels → retina encoder → sensory spikes → MaleCNS topology
       ↑                                             ↓
Playwright ← cursor/click ← motor adapter ← descending neurons
       ↓
deterministic evaluator → reward → training orchestrator
```

## Run locally

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.

## Roadmap

- [x] Interactive observability dashboard
- [x] Deterministic target-world simulation
- [x] Responsive GitHub Pages build
- [ ] MaleCNS graph compiler (Feather → CSR)
- [ ] Sparse LIF engine in PyTorch
- [ ] Pixel-to-spike retina encoder
- [ ] Descending-neuron motor adapter
- [ ] Playwright bridge and objective evaluator
- [ ] MaleCNS vs random-topology benchmark

## Scientific guardrail

MaleCNS provides biological connectivity, not a complete biological brain emulation. Neuron dynamics, neurotransmitter effects, thresholds, delays and plasticity remain modeling assumptions and must be documented as such.

## License

MIT
