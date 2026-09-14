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
