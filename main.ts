// Rare-event breakout bot for cbBTC (CBBTC/USDC), 1-minute bars.
//
// The dev window is a falling, choppy day (buy-and-hold -4.0%, every kit
// baseline loses: buy-and-hold -$44.77, momentum -$41.69, EMA-cross
// -$155.88, RSI-Bollinger -$61.84, ADX-momentum -$99.34 on grade-local).
// Frequent trading bleeds the ~26 bps round trip (4 bps fee + 2 bps
// slippage + ~7-15 bps impact each way), so this bot trades rarely and
// only on two confirmed rare events, then exits on a wide take-profit
// with a trailing stop. Backtest on the dev window (exact harness cost
// model, fills at next open): +$26.17 net, 3 round trips, max drawdown
// 1.09% -- versus -$41 or worse for every baseline.
//
// Entry (buy, 100% of cash), at most one position, 60-bar cooldown after
// any sell, no entries in the last 60 bars (avoids end-of-window flatten):
//   A) Extreme-dip reversal: 60-bar return below -2.0% AND 5-bar return
//      above +0.3% (the drop is already bouncing, not still falling).
//   B) Momentum breakout: close above the highest close of the last 60
//      bars AND 15-bar return above +0.5% (a real surge, not a drift).
// Exit (sell the whole position):
//   - take profit +3.0% unrealised, or
//   - a 0.6% trailing pullback from the best close since entry, or
//   - stop loss at -1.2% unrealised, or
//   - 240 bars held.
// Deterministic: decisions come from bar closes only; no clock, no
// randomness, no network, no files. Money math is integer (bigint);
// ratios are float64 on closes only, so the same bars give the same
// orders run after run.

import { runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const MAX_SLIPPAGE_BPS = 500;
const DIP_LOOKBACK = 60;
const DIP_DROP = -0.02;
const BOUNCE_5 = 0.003;
const MOM_LOOKBACK = 60;
const MOM_RET_15 = 0.005;
const TAKE_PROFIT = 0.03;
const TRAIL = 0.006;
const STOP_LOSS = -0.012;
const MAX_HOLD = 240;
const COOLDOWN = 60;
const NO_ENTRY_LAST_BARS = 60;

const closes: number[] = [];
let entryPrice = 0;
let bestClose = 0;
let holdBars = 0;
let lastSellSeq = -1000000;

function ret(now: number, then: number): number {
  return now / then - 1;
}

await runBars({
  onBatch(state: BarsState) {
    const bar = state.latest.get(SYMBOL);
    if (bar === undefined) return [];
    const close = Number(bar.c);
    closes.push(close);
    const i = closes.length - 1;
    if (state.warmingUp) return [];

    const held = state.positions.get(SYMBOL);
    if (held !== undefined) {
      holdBars += 1;
      if (close > bestClose) bestClose = close;
      const unrealised = ret(close, entryPrice);
      const trailDown = bestClose > entryPrice && ret(close, bestClose) <= -TRAIL;
      if (unrealised >= TAKE_PROFIT || trailDown || unrealised <= STOP_LOSS || holdBars >= MAX_HOLD) {
        lastSellSeq = state.seq;
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    if (i < DIP_LOOKBACK) return [];
    if (state.seq - lastSellSeq < COOLDOWN) return [];
    // No total-bar count in hello; 1440 bars per window, so stop entering
    // once 1380 closes have been seen (the last 60 bars).
    if (closes.length > 1440 - NO_ENTRY_LAST_BARS) return [];

    const dip = ret(close, closes[i - DIP_LOOKBACK]) < DIP_DROP && ret(close, closes[i - 5]) > BOUNCE_5;
    let mom = false;
    if (ret(close, closes[i - 15]) > MOM_RET_15) {
      mom = true;
      for (let j = i - MOM_LOOKBACK; j < i; j++) {
        if (closes[j] >= close) { mom = false; break; }
      }
    }
    if (!dip && !mom) return [];

    const cash = state.cash;
    if (cash <= 0n) return [];
    const room = state.weightRoom(SYMBOL);
    const notional = cash < room ? cash : room;
    if (notional < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    entryPrice = close;
    bestClose = close;
    holdBars = 0;
    const orders: OrderInput[] = [{ side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    return orders;
  },
});
