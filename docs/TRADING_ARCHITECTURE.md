# FlyBrain Trader architecture

## Safety boundary

The public application is a deterministic simulator. It contains no broker
credentials and cannot place an external order. The IBKR adapter is server-only,
defaults to paper mode and has three independent locks:

1. `IBKR_ACCOUNT_MODE=paper`
2. `ENABLE_IBKR_PAPER_ORDERS=true`
3. A per-order approval from the independent `RiskGate`

Live capital is not implemented.

## Training loop

```text
synthetic OHLCV → normalized features → spike encoder → sparse LIF graph
      ↑                                                    ↓
portfolio ← simulator ← RiskGate ← BUY / HOLD / SELL ← readout
      ↓
net return − costs − drawdown penalty → plasticity
```

The current browser runtime uses a deterministic 384-neuron proxy graph while
the MaleCNS slice compiler is being integrated. The UI reports this as
`LIF PROXY`; it must never be described as the full biological connectome.

## P0 audit fixes (this branch)

- **Learning rule**: the previous rule applied the same signed delta to every eligible
  synapse regardless of how much its presynaptic neuron actually fired, with no decay term —
  a lucky early streak could drive a few edges to the weight ceiling permanently (structural
  confirmation bias, not learning). It now weights the update by presynaptic firing count
  within the 16-tick window and applies homeostatic decay toward a baseline weight after every
  update. See `snn-worker.js`, function `learn`.
- **TEST/TRAIN seed families**: TEST episodes previously used the same seed formula
  (`episode*977`) as TRAIN/VALIDATION, just at a different index — same generator, same sample
  space, not an independent holdout. TEST now draws from a disjoint seed family
  (`lib/market-core.mjs`, `seedForEpisode`). This is a partial mitigation: until the market is
  driven by real historical OHLCV with a temporal split (P2), TEST is still synthetic data, just
  no longer trivially re-derivable from the TRAIN seed.
- **Control baseline**: launching the page with `?control=1` starts the worker with the same
  384-neuron topology and frozen random weights (no learning, no exploration), so the trained
  agent's TEST-phase results can be compared against a frozen-random-weight control — one of the
  minimum controls requested in the audit (a full second-worker parallel run was intentionally
  left out to keep the bundle minimal, per house style).
- **Pure, tested core**: fill price, commission, phase assignment, seed assignment and the
  per-step reward formula were extracted into `lib/market-core.mjs` and covered by
  `tests/core.test.mjs` (`npm test`, zero dependencies, Node's built-in test runner). This is the
  minimum invariant coverage — next-bar accounting and seed disjointness — not the full P0/P1
  test list from the audit (weight-freeze-during-eval and checkpoint-restore tests are still
  open).

## Promotion gates

- Unit and invariant tests for accounting and the 5% hard stop
- Walk-forward evaluation with strictly unseen periods
- Survivorship-safe US equity universe
- Commission, spread, slippage and market-impact stress tests
- Comparison against cash, buy-and-hold and simple momentum baselines
- Maximum drawdown <= 5% in every promotion suite
- At least 30 days of IBKR paper trading
- Human review of every order path and kill switch

No profitability claim may be based on synthetic training results.
