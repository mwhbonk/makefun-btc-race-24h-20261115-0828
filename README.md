# BTC Race Bot — Rare-Event Breakout (cbBTC, 1-minute bars)

Entry for make.fun bounty **"Race a BTC trading bot live for 24 hours"**
(`btc-race-24h-20261115-0828`, $250 USDC). Simulation only — no real money.

## Idea

The dev window is a falling, choppy day: BTC fell 4.0% ($67,156 → $64,524)
and every kit baseline loses on it (buy-and-hold −$44.77, momentum −$41.69,
EMA-cross −$155.88, RSI-Bollinger −$61.84, ADX-momentum −$99.34, grade-local).
A full round trip costs ~26 bps (4 bps fee + 2 bps slippage + price impact),
so frequent trading bleeds money. This bot therefore trades rarely — only
on two confirmed rare events — and exits on a wide take-profit with a
trailing stop.

## Strategy (`main.ts`, Node 22, kit SDK shim in `vendor/`)

**Entry** — buy 100% of cash, one position at a time, 60-bar cooldown after
any sell, no entries in the last 60 bars:

- **A) Extreme-dip reversal:** 60-bar return below −2.0% **and** 5-bar return
  above +0.3% (the drop is already bouncing, not still falling).
- **B) Momentum breakout:** close above the highest close of the last 60
  bars **and** 15-bar return above +0.5% (a real surge, not a drift).

**Exit** — sell the whole position on the first of:

- take profit +3.0% unrealised,
- 0.6% trailing pullback from the best close since entry,
- stop loss −1.2% unrealised,
- 240 bars held.

Deterministic: decisions come from bar closes only. No clock, no randomness,
no network, no files. Money math is integer (`bigint`); ratios are float64
on closes only, so two runs on the same data produce byte-identical orders.

## Local grade (kit `grade-local`, `--driver process`)

- **Net PnL +$22.57** on the frozen 24h dev window (return +2.26%)
- 6 trades, win rate 33%, max drawdown 1.50%, exposure 6.5%
- Fees $2.41; at 2× fees net PnL still +$20.13
- Guardrails met (≥1 trade, drawdown ≤ 25%); two executions reproduced
  byte for byte (`action_log_sha256 abc7f0b0…`)

## Run

```sh
node cli/makefun.mjs grade-local --kit <kit-dir> --bot . --driver process
```

The bot is `main.ts` in the repository root, with the kit SDK shim copied
byte-identical to `vendor/makefun-bars.ts`.
