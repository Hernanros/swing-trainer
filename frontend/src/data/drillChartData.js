// Synthetic OHLC data for drill question charts.
// Each pattern illustrates the concept described in the question text.

const cr_higher_lows = {
  candles: [
    { time: '2024-10-01', open: 103.0, high: 104.5, low: 102.0, close: 102.5 },
    { time: '2024-10-02', open: 102.5, high: 103.0, low: 100.5, close: 101.0 },
    { time: '2024-10-03', open: 101.0, high: 101.5, low:  99.0, close:  99.5 },
    { time: '2024-10-04', open:  99.5, high: 100.0, low:  97.5, close:  98.0 },
    { time: '2024-10-07', open:  98.0, high:  98.5, low:  96.5, close:  97.0 },
    { time: '2024-10-08', open:  97.0, high:  98.0, low:  95.0, close:  95.5 }, // LOW 1 → $95.0
    { time: '2024-10-09', open:  95.5, high:  98.5, low:  95.2, close:  98.0 },
    { time: '2024-10-10', open:  98.0, high:  99.5, low:  97.0, close:  98.5 },
    { time: '2024-10-11', open:  98.5, high:  99.5, low:  97.5, close:  97.8 },
    { time: '2024-10-14', open:  97.8, high:  98.5, low:  96.5, close:  97.2 }, // LOW 2 → $96.5
    { time: '2024-10-15', open:  97.2, high: 100.0, low:  97.0, close:  99.5 },
    { time: '2024-10-16', open:  99.5, high: 101.5, low:  99.0, close: 101.0 },
    { time: '2024-10-17', open: 101.0, high: 102.0, low:  99.5, close: 100.0 },
    { time: '2024-10-18', open: 100.0, high: 100.5, low:  98.0, close:  98.5 }, // LOW 3 → $98.0
    { time: '2024-10-21', open:  98.5, high: 102.0, low:  98.3, close: 101.5 },
    { time: '2024-10-22', open: 101.5, high: 104.0, low: 101.0, close: 103.5 },
    { time: '2024-10-23', open: 103.5, high: 105.5, low: 103.0, close: 105.0 },
    { time: '2024-10-24', open: 105.0, high: 107.0, low: 104.5, close: 106.5 },
  ],
}

const cr_breakout_day = {
  candles: [
    { time: '2024-10-01', open: 80.5, high: 82.0, low: 79.5, close: 80.8 },
    { time: '2024-10-02', open: 80.8, high: 82.5, low: 80.0, close: 81.5 },
    { time: '2024-10-03', open: 81.5, high: 82.0, low: 80.5, close: 81.0 },
    { time: '2024-10-04', open: 81.0, high: 83.0, low: 80.5, close: 82.0 },
    { time: '2024-10-07', open: 82.0, high: 83.0, low: 81.5, close: 82.5 },
    { time: '2024-10-08', open: 82.5, high: 83.5, low: 81.8, close: 82.2 },
    { time: '2024-10-09', open: 82.2, high: 83.5, low: 81.5, close: 83.0 },
    { time: '2024-10-10', open: 83.0, high: 83.8, low: 82.5, close: 83.3 },
    { time: '2024-10-11', open: 83.3, high: 84.0, low: 82.8, close: 83.5 },
    { time: '2024-10-14', open: 83.5, high: 84.2, low: 83.0, close: 83.8 },
    { time: '2024-10-15', open: 83.8, high: 84.5, low: 83.3, close: 84.0 },
    { time: '2024-10-16', open: 84.0, high: 84.8, low: 83.5, close: 84.2 },
    { time: '2024-10-17', open: 84.2, high: 84.8, low: 83.8, close: 84.5 },
    // BREAKOUT candle — wide range, closes near high
    { time: '2024-10-18', open: 84.8, high: 90.5, low: 84.5, close: 90.0 },
    { time: '2024-10-21', open: 90.0, high: 92.0, low: 89.5, close: 91.5 },
    { time: '2024-10-22', open: 91.5, high: 93.5, low: 91.0, close: 93.0 },
    { time: '2024-10-23', open: 93.0, high: 94.5, low: 92.5, close: 94.0 },
  ],
}

// Gap up 8% on earnings, but closes near prior close — bearish reversal gap
const cr_gap_fade = {
  candles: [
    { time: '2024-10-01', open:  91.0, high:  93.0, low:  90.5, close:  92.5 },
    { time: '2024-10-02', open:  92.5, high:  94.5, low:  92.0, close:  94.0 },
    { time: '2024-10-03', open:  94.0, high:  96.0, low:  93.5, close:  95.5 },
    { time: '2024-10-04', open:  95.5, high:  97.5, low:  95.0, close:  97.0 },
    { time: '2024-10-07', open:  97.0, high:  99.0, low:  96.5, close:  98.5 },
    { time: '2024-10-08', open:  98.5, high: 100.5, low:  98.0, close: 100.0 }, // pre-earnings close
    // Earnings gap: opens $108 (+8%), trades to $111.5, fades to close $101 — big upper wick
    { time: '2024-10-09', open: 108.0, high: 111.5, low:  99.5, close: 101.0 },
    { time: '2024-10-10', open: 101.0, high: 103.0, low:  99.0, close:  99.5 },
    { time: '2024-10-11', open:  99.5, high: 100.5, low:  97.0, close:  97.5 },
    { time: '2024-10-14', open:  97.5, high:  98.5, low:  95.5, close:  96.0 },
    { time: '2024-10-15', open:  96.0, high:  97.0, low:  94.5, close:  95.0 },
  ],
}

// Strong uptrend → pullback to 21-day EMA → bounce
const ema_pullback = {
  candles: [
    { time: '2024-09-03', open:  82.0, high:  84.0, low:  81.5, close:  83.5 },
    { time: '2024-09-04', open:  83.5, high:  86.0, low:  83.0, close:  85.5 },
    { time: '2024-09-05', open:  85.5, high:  88.0, low:  85.0, close:  87.5 },
    { time: '2024-09-09', open:  87.5, high:  90.5, low:  87.0, close:  90.0 },
    { time: '2024-09-10', open:  90.0, high:  92.5, low:  89.5, close:  92.0 },
    { time: '2024-09-11', open:  92.0, high:  95.0, low:  91.5, close:  94.5 },
    { time: '2024-09-12', open:  94.5, high:  97.0, low:  94.0, close:  96.5 },
    { time: '2024-09-13', open:  96.5, high:  99.5, low:  96.0, close:  99.0 },
    { time: '2024-09-16', open:  99.0, high: 102.0, low:  98.5, close: 101.5 },
    { time: '2024-09-17', open: 101.5, high: 104.5, low: 101.0, close: 104.0 },
    { time: '2024-09-18', open: 104.0, high: 107.0, low: 103.5, close: 106.5 },
    // Low-volume pullback begins
    { time: '2024-09-19', open: 106.5, high: 107.5, low: 104.5, close: 105.0 },
    { time: '2024-09-20', open: 105.0, high: 106.0, low: 103.0, close: 103.5 },
    { time: '2024-09-23', open: 103.5, high: 104.5, low: 101.5, close: 102.0 },
    { time: '2024-09-24', open: 102.0, high: 103.0, low: 100.0, close: 100.5 },
    { time: '2024-09-25', open: 100.5, high: 101.5, low:  98.5, close:  99.0 },
    { time: '2024-09-26', open:  99.0, high: 100.0, low:  97.5, close:  97.5 },
    // Price touches 21-day EMA — low dips just below EMA then closes above
    { time: '2024-09-27', open:  97.5, high:  98.0, low:  95.2, close:  96.5 },
    { time: '2024-09-30', open:  96.5, high: 100.5, low:  96.3, close: 100.0 }, // bounce
    { time: '2024-10-01', open: 100.0, high: 103.5, low:  99.5, close: 103.0 },
    { time: '2024-10-02', open: 103.0, high: 106.0, low: 102.5, close: 105.5 },
  ],
  // 21-day EMA values (pre-computed, k = 2/22, seed EMA = 80)
  maLine: [
    { time: '2024-09-03', value: 80.3 },
    { time: '2024-09-04', value: 80.8 },
    { time: '2024-09-05', value: 81.4 },
    { time: '2024-09-09', value: 82.2 },
    { time: '2024-09-10', value: 83.1 },
    { time: '2024-09-11', value: 84.1 },
    { time: '2024-09-12', value: 85.2 },
    { time: '2024-09-13', value: 86.5 },
    { time: '2024-09-16', value: 87.8 },
    { time: '2024-09-17', value: 89.3 },
    { time: '2024-09-18', value: 90.9 },
    { time: '2024-09-19', value: 92.1 },
    { time: '2024-09-20', value: 93.2 },
    { time: '2024-09-23', value: 94.0 },
    { time: '2024-09-24', value: 94.6 },
    { time: '2024-09-25', value: 95.0 },
    { time: '2024-09-26', value: 95.2 },
    { time: '2024-09-27', value: 95.3 }, // EMA ~$95.3, price low $95.2 — touch!
    { time: '2024-09-30', value: 95.7 },
    { time: '2024-10-01', value: 96.4 },
    { time: '2024-10-02', value: 97.2 },
  ],
}

// Volatility Contraction Pattern — daily range shrinks week over week
const cr_vcp = {
  candles: [
    // Week 1 — wide ranges (~7-9 pts)
    { time: '2024-10-01', open:  99.0, high: 104.0, low:  95.0, close:  97.0 },
    { time: '2024-10-02', open:  97.0, high: 101.5, low:  94.5, close: 100.0 },
    { time: '2024-10-03', open: 100.0, high: 105.0, low:  97.0, close:  98.5 },
    { time: '2024-10-04', open:  98.5, high: 103.0, low:  95.5, close: 101.0 },
    { time: '2024-10-07', open: 101.0, high: 106.0, low:  98.0, close: 100.0 },
    // Week 2 — medium ranges (~5-6 pts)
    { time: '2024-10-08', open: 100.0, high: 104.0, low:  98.0, close: 102.5 },
    { time: '2024-10-09', open: 102.5, high: 105.5, low: 100.0, close: 101.5 },
    { time: '2024-10-10', open: 101.5, high: 105.0, low: 100.0, close: 103.5 },
    { time: '2024-10-11', open: 103.5, high: 106.5, low: 101.5, close: 103.0 },
    { time: '2024-10-14', open: 103.0, high: 106.0, low: 101.5, close: 104.5 },
    // Week 3 — smaller ranges (~3-4 pts)
    { time: '2024-10-15', open: 104.5, high: 107.5, low: 103.5, close: 105.5 },
    { time: '2024-10-16', open: 105.5, high: 108.0, low: 104.5, close: 106.5 },
    { time: '2024-10-17', open: 106.5, high: 108.5, low: 105.5, close: 107.0 },
    { time: '2024-10-18', open: 107.0, high: 109.0, low: 106.5, close: 108.0 },
    { time: '2024-10-21', open: 108.0, high: 109.5, low: 107.0, close: 108.5 },
    // Week 4 — tight ranges (~1.5 pts)
    { time: '2024-10-22', open: 108.5, high: 109.5, low: 108.0, close: 109.0 },
    { time: '2024-10-23', open: 109.0, high: 110.0, low: 108.5, close: 109.5 },
    { time: '2024-10-24', open: 109.5, high: 110.5, low: 109.0, close: 110.0 },
    { time: '2024-10-25', open: 110.0, high: 110.5, low: 109.5, close: 110.0 },
    // Week 5 — extremely tight (~0.5-0.7 pts)
    { time: '2024-10-28', open: 110.0, high: 110.5, low: 109.8, close: 110.2 },
    { time: '2024-10-29', open: 110.2, high: 110.7, low: 110.0, close: 110.5 },
    { time: '2024-10-30', open: 110.5, high: 110.8, low: 110.2, close: 110.5 },
    { time: '2024-10-31', open: 110.5, high: 111.0, low: 110.3, close: 110.8 },
  ],
}

// Flat base (7 weeks) → clean breakout on big volume
const ss_flat_base = {
  candles: [
    { time: '2024-09-03', open: 78.0, high: 79.5, low: 77.0, close: 78.5 },
    { time: '2024-09-04', open: 78.5, high: 79.0, low: 77.5, close: 78.0 },
    { time: '2024-09-05', open: 78.0, high: 79.5, low: 77.5, close: 79.0 },
    { time: '2024-09-09', open: 79.0, high: 79.5, low: 77.5, close: 78.0 },
    { time: '2024-09-10', open: 78.0, high: 79.5, low: 77.5, close: 78.5 },
    { time: '2024-09-11', open: 78.5, high: 79.5, low: 77.5, close: 78.5 },
    { time: '2024-09-12', open: 78.5, high: 79.5, low: 77.5, close: 79.0 },
    { time: '2024-09-13', open: 79.0, high: 79.5, low: 77.5, close: 78.5 },
    { time: '2024-09-16', open: 78.5, high: 79.5, low: 77.5, close: 78.5 },
    { time: '2024-09-17', open: 78.5, high: 79.5, low: 77.5, close: 78.5 },
    { time: '2024-09-18', open: 78.5, high: 79.5, low: 78.0, close: 79.0 },
    { time: '2024-09-19', open: 79.0, high: 79.5, low: 78.0, close: 78.5 },
    { time: '2024-09-20', open: 78.5, high: 79.5, low: 78.0, close: 79.0 },
    { time: '2024-09-23', open: 79.0, high: 79.5, low: 78.0, close: 78.5 },
    { time: '2024-09-24', open: 78.5, high: 79.5, low: 78.0, close: 79.0 },
    { time: '2024-09-25', open: 79.0, high: 79.5, low: 78.0, close: 78.5 },
    { time: '2024-09-26', open: 78.5, high: 79.5, low: 78.0, close: 79.0 },
    { time: '2024-09-27', open: 79.0, high: 79.8, low: 78.5, close: 79.5 },
    { time: '2024-09-30', open: 79.5, high: 79.8, low: 78.5, close: 79.5 },
    { time: '2024-10-01', open: 79.5, high: 79.8, low: 78.8, close: 79.2 },
    // BREAKOUT — clean clear of $79.5 resistance
    { time: '2024-10-02', open: 79.8, high: 84.5, low: 79.5, close: 84.0 },
    { time: '2024-10-03', open: 84.0, high: 85.5, low: 83.5, close: 85.0 },
    { time: '2024-10-04', open: 85.0, high: 87.0, low: 84.5, close: 86.5 },
  ],
}

// First breakout attempt fails, second attempt at same resistance level
const ss_failed_breakout = {
  candles: [
    { time: '2024-09-03', open: 80.0, high: 81.5, low: 79.5, close: 81.0 },
    { time: '2024-09-04', open: 81.0, high: 82.5, low: 80.5, close: 82.0 },
    { time: '2024-09-05', open: 82.0, high: 83.5, low: 81.5, close: 83.0 },
    { time: '2024-09-09', open: 83.0, high: 84.5, low: 82.5, close: 84.0 },
    { time: '2024-09-10', open: 84.0, high: 85.5, low: 83.5, close: 84.5 },
    // FIRST attempt: briefly above $85, but closes back below — failure
    { time: '2024-09-11', open: 84.5, high: 86.5, low: 83.5, close: 83.8 },
    // Pullback after failure
    { time: '2024-09-12', open: 83.8, high: 84.5, low: 82.5, close: 83.0 },
    { time: '2024-09-13', open: 83.0, high: 83.5, low: 81.5, close: 82.0 },
    { time: '2024-09-16', open: 82.0, high: 82.5, low: 81.0, close: 81.5 },
    { time: '2024-09-17', open: 81.5, high: 82.5, low: 81.0, close: 82.0 },
    { time: '2024-09-18', open: 82.0, high: 83.0, low: 81.5, close: 82.5 },
    { time: '2024-09-19', open: 82.5, high: 83.5, low: 82.0, close: 83.0 },
    // SECOND attempt building back to same $85 resistance on average volume
    { time: '2024-09-20', open: 83.0, high: 84.0, low: 82.5, close: 83.5 },
    { time: '2024-09-23', open: 83.5, high: 84.5, low: 83.0, close: 84.0 },
    { time: '2024-09-24', open: 84.0, high: 85.0, low: 83.5, close: 84.5 },
    { time: '2024-09-25', open: 84.5, high: 85.2, low: 84.0, close: 84.8 },
  ],
}

// Uptrend to +2R, then a large bearish reversal candle
const tm_bearish_reversal = {
  candles: [
    { time: '2024-10-01', open: 80.0, high: 81.5, low: 79.5, close: 81.5 }, // entry day
    { time: '2024-10-02', open: 81.5, high: 83.0, low: 81.0, close: 82.5 },
    { time: '2024-10-03', open: 82.5, high: 84.0, low: 82.0, close: 83.5 },
    { time: '2024-10-04', open: 83.5, high: 85.5, low: 83.0, close: 85.0 },
    { time: '2024-10-07', open: 85.0, high: 86.8, low: 84.5, close: 86.5 }, // approaching 2R
    // BEARISH REVERSAL — opens at 2R, runs to $89, crashes to close near $84
    { time: '2024-10-08', open: 86.5, high: 89.0, low: 83.5, close: 84.0 },
    { time: '2024-10-09', open: 84.0, high: 85.5, low: 82.5, close: 83.0 },
    { time: '2024-10-10', open: 83.0, high: 84.0, low: 81.0, close: 81.5 },
  ],
}

// ─── Chart Pattern ID drills ──────────────────────────────────────────────────

const cp_double_top = {
  candles: [
    { time: '2024-11-01', open:  85.0, high:  87.0, low:  84.5, close:  86.5 },
    { time: '2024-11-04', open:  86.5, high:  89.0, low:  86.0, close:  88.5 },
    { time: '2024-11-05', open:  88.5, high:  91.0, low:  88.0, close:  90.5 },
    { time: '2024-11-06', open:  90.5, high:  93.0, low:  90.0, close:  92.5 },
    { time: '2024-11-07', open:  92.5, high:  95.0, low:  92.0, close:  94.5 },
    { time: '2024-11-08', open:  94.5, high:  98.0, low:  94.0, close:  97.5 },
    { time: '2024-11-11', open:  97.5, high: 102.5, low:  97.0, close: 102.0 }, // Peak 1
    { time: '2024-11-12', open: 102.0, high: 102.5, low:  99.5, close: 100.0 },
    { time: '2024-11-13', open: 100.0, high: 101.0, low:  98.0, close:  98.5 },
    { time: '2024-11-14', open:  98.5, high:  99.5, low:  96.0, close:  96.5 },
    { time: '2024-11-15', open:  96.5, high:  97.0, low:  94.0, close:  94.5 },
    { time: '2024-11-18', open:  94.5, high:  95.0, low:  92.5, close:  93.0 }, // Neckline ~$93
    { time: '2024-11-19', open:  93.0, high:  95.5, low:  92.5, close:  95.0 },
    { time: '2024-11-20', open:  95.0, high:  97.5, low:  94.5, close:  97.0 },
    { time: '2024-11-21', open:  97.0, high:  99.5, low:  96.5, close:  99.0 },
    { time: '2024-11-22', open:  99.0, high: 101.5, low:  98.5, close: 101.0 },
    { time: '2024-11-25', open: 101.0, high: 102.5, low: 100.5, close: 102.0 }, // Peak 2 (same level)
    { time: '2024-11-26', open: 102.0, high: 102.5, low: 100.0, close: 100.5 },
    { time: '2024-11-27', open: 100.5, high: 101.0, low:  98.5, close:  99.0 },
    { time: '2024-11-29', open:  99.0, high:  99.5, low:  97.0, close:  97.5 },
  ],
}

const cp_double_bottom = {
  candles: [
    { time: '2024-11-01', open: 100.0, high: 101.0, low:  98.5, close:  99.0 },
    { time: '2024-11-04', open:  99.0, high:  99.5, low:  97.0, close:  97.5 },
    { time: '2024-11-05', open:  97.5, high:  98.0, low:  95.5, close:  96.0 },
    { time: '2024-11-06', open:  96.0, high:  96.5, low:  94.0, close:  94.5 },
    { time: '2024-11-07', open:  94.5, high:  95.0, low:  92.5, close:  93.0 },
    { time: '2024-11-08', open:  93.0, high:  93.5, low:  90.0, close:  90.5 },
    { time: '2024-11-11', open:  90.5, high:  91.0, low:  82.0, close:  82.5 }, // Bottom 1 ~$82
    { time: '2024-11-12', open:  82.5, high:  85.0, low:  82.0, close:  84.5 },
    { time: '2024-11-13', open:  84.5, high:  87.0, low:  84.0, close:  86.5 },
    { time: '2024-11-14', open:  86.5, high:  89.5, low:  86.0, close:  89.0 },
    { time: '2024-11-15', open:  89.0, high:  92.0, low:  88.5, close:  91.5 },
    { time: '2024-11-18', open:  91.5, high:  93.5, low:  91.0, close:  93.0 }, // Neckline ~$93
    { time: '2024-11-19', open:  93.0, high:  93.5, low:  91.0, close:  91.5 },
    { time: '2024-11-20', open:  91.5, high:  92.0, low:  89.0, close:  89.5 },
    { time: '2024-11-21', open:  89.5, high:  90.0, low:  87.0, close:  87.5 },
    { time: '2024-11-22', open:  87.5, high:  88.0, low:  85.0, close:  85.5 },
    { time: '2024-11-25', open:  85.5, high:  86.0, low:  82.0, close:  82.5 }, // Bottom 2 (same level)
    { time: '2024-11-26', open:  82.5, high:  86.0, low:  82.0, close:  85.5 },
    { time: '2024-11-27', open:  85.5, high:  88.5, low:  85.0, close:  88.0 },
    { time: '2024-11-29', open:  88.0, high:  91.0, low:  87.5, close:  90.5 },
  ],
}

const cp_ascending_channel = {
  candles: [
    { time: '2024-11-01', open:  80.0, high:  84.5, low:  79.5, close:  84.0 },
    { time: '2024-11-04', open:  84.0, high:  85.5, low:  82.0, close:  82.5 },
    { time: '2024-11-05', open:  82.5, high:  83.5, low:  81.5, close:  83.0 },
    { time: '2024-11-06', open:  83.0, high:  87.5, low:  82.5, close:  87.0 },
    { time: '2024-11-07', open:  87.0, high:  88.0, low:  84.5, close:  85.0 },
    { time: '2024-11-08', open:  85.0, high:  86.0, low:  84.0, close:  85.5 },
    { time: '2024-11-11', open:  85.5, high:  90.0, low:  85.0, close:  89.5 },
    { time: '2024-11-12', open:  89.5, high:  90.5, low:  87.0, close:  87.5 },
    { time: '2024-11-13', open:  87.5, high:  88.5, low:  86.5, close:  88.0 },
    { time: '2024-11-14', open:  88.0, high:  92.5, low:  87.5, close:  92.0 },
    { time: '2024-11-15', open:  92.0, high:  93.0, low:  89.5, close:  90.0 },
    { time: '2024-11-18', open:  90.0, high:  91.0, low:  89.0, close:  90.5 },
    { time: '2024-11-19', open:  90.5, high:  95.5, low:  90.0, close:  95.0 },
    { time: '2024-11-20', open:  95.0, high:  96.0, low:  92.5, close:  93.0 },
    { time: '2024-11-21', open:  93.0, high:  94.0, low:  92.0, close:  93.5 },
    { time: '2024-11-22', open:  93.5, high:  98.0, low:  93.0, close:  97.5 },
    { time: '2024-11-25', open:  97.5, high:  99.5, low:  95.5, close:  96.0 },
    { time: '2024-11-26', open:  96.0, high:  97.0, low:  95.0, close:  96.5 },
    { time: '2024-11-27', open:  96.5, high: 101.0, low:  96.0, close: 100.5 },
  ],
}

const cp_descending_channel = {
  candles: [
    { time: '2024-11-01', open: 100.0, high: 101.0, low:  95.5, close:  96.0 },
    { time: '2024-11-04', open:  96.0, high:  97.5, low:  95.5, close:  97.0 },
    { time: '2024-11-05', open:  97.0, high:  97.5, low:  92.5, close:  93.0 },
    { time: '2024-11-06', open:  93.0, high:  95.0, low:  92.5, close:  94.5 },
    { time: '2024-11-07', open:  94.5, high:  95.0, low:  89.5, close:  90.0 },
    { time: '2024-11-08', open:  90.0, high:  92.0, low:  89.5, close:  91.5 },
    { time: '2024-11-11', open:  91.5, high:  92.0, low:  87.0, close:  87.5 },
    { time: '2024-11-12', open:  87.5, high:  89.5, low:  87.0, close:  89.0 },
    { time: '2024-11-13', open:  89.0, high:  89.5, low:  84.5, close:  85.0 },
    { time: '2024-11-14', open:  85.0, high:  87.0, low:  84.5, close:  86.5 },
    { time: '2024-11-15', open:  86.5, high:  87.0, low:  82.0, close:  82.5 },
    { time: '2024-11-18', open:  82.5, high:  84.5, low:  82.0, close:  84.0 },
    { time: '2024-11-19', open:  84.0, high:  84.5, low:  79.5, close:  80.0 },
    { time: '2024-11-20', open:  80.0, high:  82.0, low:  79.5, close:  81.5 },
  ],
}

const cp_head_shoulders = {
  candles: [
    // Left shoulder ~$95
    { time: '2024-11-01', open:  85.0, high:  87.5, low:  84.5, close:  87.0 },
    { time: '2024-11-04', open:  87.0, high:  90.5, low:  86.5, close:  90.0 },
    { time: '2024-11-05', open:  90.0, high:  95.5, low:  89.5, close:  95.0 }, // Left shoulder
    { time: '2024-11-06', open:  95.0, high:  95.5, low:  92.0, close:  92.5 },
    { time: '2024-11-07', open:  92.5, high:  93.5, low:  89.0, close:  89.5 },
    { time: '2024-11-08', open:  89.5, high:  90.0, low:  87.5, close:  88.0 }, // Neckline ~$88
    // Head ~$100
    { time: '2024-11-11', open:  88.0, high:  91.0, low:  87.5, close:  90.5 },
    { time: '2024-11-12', open:  90.5, high:  94.5, low:  90.0, close:  94.0 },
    { time: '2024-11-13', open:  94.0, high: 100.5, low:  93.5, close: 100.0 }, // Head
    { time: '2024-11-14', open: 100.0, high: 100.5, low:  97.0, close:  97.5 },
    { time: '2024-11-15', open:  97.5, high:  98.0, low:  94.5, close:  95.0 },
    { time: '2024-11-18', open:  95.0, high:  95.5, low:  91.0, close:  91.5 },
    { time: '2024-11-19', open:  91.5, high:  92.0, low:  88.0, close:  88.5 }, // Back to neckline
    // Right shoulder ~$95
    { time: '2024-11-20', open:  88.5, high:  91.5, low:  88.0, close:  91.0 },
    { time: '2024-11-21', open:  91.0, high:  94.5, low:  90.5, close:  94.0 },
    { time: '2024-11-22', open:  94.0, high:  95.5, low:  93.5, close:  95.0 }, // Right shoulder
    { time: '2024-11-25', open:  95.0, high:  95.5, low:  92.5, close:  93.0 },
    { time: '2024-11-26', open:  93.0, high:  93.5, low:  90.0, close:  90.5 },
    { time: '2024-11-27', open:  90.5, high:  91.0, low:  88.0, close:  88.5 }, // Returning to neckline
  ],
}

const cp_inv_head_shoulders = {
  candles: [
    // Left shoulder ~$85
    { time: '2024-11-01', open:  97.0, high:  97.5, low:  94.0, close:  94.5 },
    { time: '2024-11-04', open:  94.5, high:  95.0, low:  91.5, close:  92.0 },
    { time: '2024-11-05', open:  92.0, high:  92.5, low:  85.0, close:  85.5 }, // Left shoulder
    { time: '2024-11-06', open:  85.5, high:  88.5, low:  85.0, close:  88.0 },
    { time: '2024-11-07', open:  88.0, high:  91.5, low:  87.5, close:  91.0 },
    { time: '2024-11-08', open:  91.0, high:  93.5, low:  90.5, close:  93.0 }, // Neckline ~$93
    // Head ~$80
    { time: '2024-11-11', open:  93.0, high:  93.5, low:  90.0, close:  90.5 },
    { time: '2024-11-12', open:  90.5, high:  91.0, low:  87.0, close:  87.5 },
    { time: '2024-11-13', open:  87.5, high:  88.0, low:  80.0, close:  80.5 }, // Head (deepest)
    { time: '2024-11-14', open:  80.5, high:  84.0, low:  80.0, close:  83.5 },
    { time: '2024-11-15', open:  83.5, high:  87.5, low:  83.0, close:  87.0 },
    { time: '2024-11-18', open:  87.0, high:  91.0, low:  86.5, close:  90.5 },
    { time: '2024-11-19', open:  90.5, high:  93.5, low:  90.0, close:  93.0 }, // Back to neckline
    // Right shoulder ~$85
    { time: '2024-11-20', open:  93.0, high:  93.5, low:  90.5, close:  91.0 },
    { time: '2024-11-21', open:  91.0, high:  91.5, low:  85.0, close:  85.5 }, // Right shoulder
    { time: '2024-11-22', open:  85.5, high:  89.5, low:  85.0, close:  89.0 },
    { time: '2024-11-25', open:  89.0, high:  92.5, low:  88.5, close:  92.0 },
    { time: '2024-11-26', open:  92.0, high:  93.5, low:  91.5, close:  93.5 }, // Approaching neckline
  ],
}

const cp_bull_flag = {
  candles: [
    // POLE — strong advance
    { time: '2024-11-01', open:  75.0, high:  78.0, low:  74.5, close:  77.5 },
    { time: '2024-11-04', open:  77.5, high:  81.0, low:  77.0, close:  80.5 },
    { time: '2024-11-05', open:  80.5, high:  84.0, low:  80.0, close:  83.5 },
    { time: '2024-11-06', open:  83.5, high:  87.0, low:  83.0, close:  86.5 },
    { time: '2024-11-07', open:  86.5, high:  90.0, low:  86.0, close:  89.5 },
    { time: '2024-11-08', open:  89.5, high:  93.0, low:  89.0, close:  92.5 }, // Top of pole
    // FLAG — tight consolidation, slight downward drift, low volume
    { time: '2024-11-11', open:  92.5, high:  93.0, low:  91.0, close:  91.5 },
    { time: '2024-11-12', open:  91.5, high:  92.5, low:  90.5, close:  92.0 },
    { time: '2024-11-13', open:  92.0, high:  92.5, low:  90.5, close:  91.0 },
    { time: '2024-11-14', open:  91.0, high:  92.0, low:  90.0, close:  91.5 },
    { time: '2024-11-15', open:  91.5, high:  92.0, low:  90.0, close:  90.5 },
    { time: '2024-11-18', open:  90.5, high:  91.5, low:  90.0, close:  91.0 },
    { time: '2024-11-19', open:  91.0, high:  91.5, low:  90.0, close:  90.5 },
    { time: '2024-11-20', open:  90.5, high:  91.5, low:  90.0, close:  91.0 },
  ],
}

const cp_bear_flag = {
  candles: [
    // POLE — sharp drop
    { time: '2024-11-01', open: 100.0, high: 100.5, low:  97.0, close:  97.5 },
    { time: '2024-11-04', open:  97.5, high:  98.0, low:  94.5, close:  95.0 },
    { time: '2024-11-05', open:  95.0, high:  95.5, low:  91.5, close:  92.0 },
    { time: '2024-11-06', open:  92.0, high:  92.5, low:  88.5, close:  89.0 },
    { time: '2024-11-07', open:  89.0, high:  89.5, low:  85.5, close:  86.0 },
    { time: '2024-11-08', open:  86.0, high:  86.5, low:  82.0, close:  82.5 }, // Bottom of pole
    // FLAG — tight sideways / slight upward drift
    { time: '2024-11-11', open:  82.5, high:  84.5, low:  82.0, close:  84.0 },
    { time: '2024-11-12', open:  84.0, high:  85.0, low:  83.5, close:  84.5 },
    { time: '2024-11-13', open:  84.5, high:  85.5, low:  84.0, close:  85.0 },
    { time: '2024-11-14', open:  85.0, high:  85.5, low:  84.0, close:  84.5 },
    { time: '2024-11-15', open:  84.5, high:  85.5, low:  84.0, close:  85.0 },
    { time: '2024-11-18', open:  85.0, high:  85.5, low:  84.0, close:  84.5 },
    { time: '2024-11-19', open:  84.5, high:  85.5, low:  84.0, close:  85.0 },
    { time: '2024-11-20', open:  85.0, high:  85.5, low:  84.5, close:  84.5 },
  ],
}

// Downtrend → hammer candle (small body at top, very long lower wick)
const cp_hammer = {
  candles: [
    { time: '2024-11-01', open: 105.0, high: 106.5, low: 104.0, close: 104.5 },
    { time: '2024-11-04', open: 104.5, high: 105.0, low: 103.0, close: 103.5 },
    { time: '2024-11-05', open: 103.5, high: 104.0, low: 102.0, close: 102.5 },
    { time: '2024-11-06', open: 102.5, high: 103.0, low: 101.0, close: 101.5 },
    { time: '2024-11-07', open: 101.5, high: 102.0, low: 100.0, close: 100.5 },
    { time: '2024-11-08', open: 100.5, high: 101.0, low:  99.0, close:  99.5 },
    { time: '2024-11-11', open:  99.5, high: 100.0, low:  98.0, close:  98.5 },
    { time: '2024-11-12', open:  98.5, high:  99.0, low:  97.0, close:  97.5 },
    // HAMMER — small body at top, long lower wick (~4× body)
    { time: '2024-11-13', open:  96.5, high:  97.8, low:  93.0, close:  97.5 },
  ],
}

// Uptrend → shooting star (small body at bottom, very long upper wick)
const cp_shooting_star = {
  candles: [
    { time: '2024-11-01', open:  88.0, high:  89.5, low:  87.5, close:  89.0 },
    { time: '2024-11-04', open:  89.0, high:  91.0, low:  88.5, close:  90.5 },
    { time: '2024-11-05', open:  90.5, high:  92.5, low:  90.0, close:  92.0 },
    { time: '2024-11-06', open:  92.0, high:  94.0, low:  91.5, close:  93.5 },
    { time: '2024-11-07', open:  93.5, high:  95.5, low:  93.0, close:  95.0 },
    { time: '2024-11-08', open:  95.0, high:  97.0, low:  94.5, close:  96.5 },
    { time: '2024-11-11', open:  96.5, high:  98.5, low:  96.0, close:  98.0 },
    { time: '2024-11-12', open:  98.0, high: 100.0, low:  97.5, close:  99.5 },
    // SHOOTING STAR — small body at bottom, long upper wick (~9× body)
    { time: '2024-11-13', open:  99.5, high: 104.5, low:  99.3, close: 100.0 },
    { time: '2024-11-14', open: 100.0, high: 100.5, low:  97.0, close:  97.5 },
    { time: '2024-11-15', open:  97.5, high:  98.0, low:  95.0, close:  95.5 },
  ],
}

// Downtrend → small red candle → large green candle that engulfs it
const cp_bullish_engulfing = {
  candles: [
    { time: '2024-11-01', open: 100.0, high: 101.0, low:  99.0, close:  99.5 },
    { time: '2024-11-04', open:  99.5, high: 100.0, low:  98.0, close:  98.5 },
    { time: '2024-11-05', open:  98.5, high:  99.0, low:  97.0, close:  97.5 },
    { time: '2024-11-06', open:  97.5, high:  98.0, low:  96.0, close:  96.5 },
    { time: '2024-11-07', open:  96.5, high:  97.0, low:  95.0, close:  95.5 },
    { time: '2024-11-08', open:  95.5, high:  96.0, low:  94.0, close:  94.5 },
    // Small red candle to be engulfed
    { time: '2024-11-11', open:  94.5, high:  95.0, low:  93.5, close:  94.0 },
    // BULLISH ENGULFING — opens below prior close, closes above prior open
    { time: '2024-11-12', open:  93.5, high:  96.0, low:  93.0, close:  95.5 },
  ],
}

// Uptrend → small green candle → large red candle that engulfs it
const cp_bearish_engulfing = {
  candles: [
    { time: '2024-11-01', open:  88.0, high:  89.0, low:  87.5, close:  88.5 },
    { time: '2024-11-04', open:  88.5, high:  90.0, low:  88.0, close:  89.5 },
    { time: '2024-11-05', open:  89.5, high:  91.0, low:  89.0, close:  90.5 },
    { time: '2024-11-06', open:  90.5, high:  92.0, low:  90.0, close:  91.5 },
    { time: '2024-11-07', open:  91.5, high:  93.0, low:  91.0, close:  92.5 },
    { time: '2024-11-08', open:  92.5, high:  94.0, low:  92.0, close:  93.5 },
    // Small green candle to be engulfed
    { time: '2024-11-11', open:  93.5, high:  94.5, low:  93.0, close:  94.0 },
    // BEARISH ENGULFING — opens above prior close, closes below prior open
    { time: '2024-11-12', open:  94.5, high:  95.0, low:  92.0, close:  92.5 },
  ],
}

// Three clean bounces off same horizontal support (~$88)
const cp_support_bounce = {
  candles: [
    { time: '2024-11-01', open:  96.0, high:  97.0, low:  95.5, close:  96.5 },
    { time: '2024-11-04', open:  96.5, high:  97.0, low:  94.0, close:  94.5 },
    { time: '2024-11-05', open:  94.5, high:  95.0, low:  91.5, close:  92.0 },
    { time: '2024-11-06', open:  92.0, high:  92.5, low:  88.5, close:  89.0 },
    { time: '2024-11-07', open:  89.0, high:  90.0, low:  87.8, close:  89.5 }, // Touch 1 ~$88
    { time: '2024-11-08', open:  89.5, high:  92.5, low:  89.0, close:  92.0 },
    { time: '2024-11-11', open:  92.0, high:  93.5, low:  91.5, close:  93.0 },
    { time: '2024-11-12', open:  93.0, high:  94.0, low:  91.5, close:  92.0 },
    { time: '2024-11-13', open:  92.0, high:  92.5, low:  90.0, close:  90.5 },
    { time: '2024-11-14', open:  90.5, high:  91.0, low:  88.5, close:  89.0 },
    { time: '2024-11-15', open:  89.0, high:  90.0, low:  87.8, close:  89.5 }, // Touch 2 ~$88
    { time: '2024-11-18', open:  89.5, high:  93.0, low:  89.0, close:  92.5 },
    { time: '2024-11-19', open:  92.5, high:  93.5, low:  91.5, close:  92.0 },
    { time: '2024-11-20', open:  92.0, high:  92.5, low:  90.0, close:  90.5 },
    { time: '2024-11-21', open:  90.5, high:  91.0, low:  88.5, close:  89.0 },
    { time: '2024-11-22', open:  89.0, high:  90.0, low:  87.8, close:  89.5 }, // Touch 3 ~$88
    { time: '2024-11-25', open:  89.5, high:  93.5, low:  89.0, close:  93.0 },
    { time: '2024-11-26', open:  93.0, high:  95.5, low:  92.5, close:  95.0 },
  ],
}

// Three rejections at same horizontal resistance (~$105)
const cp_resistance_rejection = {
  candles: [
    { time: '2024-11-01', open:  97.0, high:  98.5, low:  96.5, close:  98.0 },
    { time: '2024-11-04', open:  98.0, high: 100.5, low:  97.5, close: 100.0 },
    { time: '2024-11-05', open: 100.0, high: 102.5, low:  99.5, close: 102.0 },
    { time: '2024-11-06', open: 102.0, high: 105.5, low: 101.5, close: 104.5 },
    { time: '2024-11-07', open: 104.5, high: 105.5, low: 103.0, close: 103.5 }, // Rejection 1
    { time: '2024-11-08', open: 103.5, high: 104.0, low: 101.5, close: 102.0 },
    { time: '2024-11-11', open: 102.0, high: 103.0, low: 101.0, close: 102.5 },
    { time: '2024-11-12', open: 102.5, high: 104.5, low: 102.0, close: 104.0 },
    { time: '2024-11-13', open: 104.0, high: 105.5, low: 103.5, close: 104.0 }, // Rejection 2
    { time: '2024-11-14', open: 104.0, high: 104.5, low: 102.0, close: 102.5 },
    { time: '2024-11-15', open: 102.5, high: 103.5, low: 101.5, close: 103.0 },
    { time: '2024-11-18', open: 103.0, high: 105.5, low: 102.5, close: 103.5 }, // Rejection 3
    { time: '2024-11-19', open: 103.5, high: 104.0, low: 101.5, close: 102.0 },
    { time: '2024-11-20', open: 102.0, high: 102.5, low: 100.5, close: 101.0 },
  ],
}

// Resistance at $95 → breakout → retest of old resistance as new support → continuation
const cp_breakout_retest = {
  candles: [
    { time: '2024-11-01', open:  91.0, high:  93.0, low:  90.5, close:  92.5 },
    { time: '2024-11-04', open:  92.5, high:  94.0, low:  92.0, close:  93.5 },
    { time: '2024-11-05', open:  93.5, high:  95.0, low:  93.0, close:  94.5 },
    { time: '2024-11-06', open:  94.5, high:  95.0, low:  93.5, close:  94.0 }, // Resistance ~$95
    { time: '2024-11-07', open:  94.0, high:  95.0, low:  93.5, close:  94.5 },
    { time: '2024-11-08', open:  94.5, high:  95.5, low:  94.0, close:  94.5 }, // Near resistance
    // BREAKOUT
    { time: '2024-11-11', open:  95.0, high:  98.5, low:  94.8, close:  98.0 },
    { time: '2024-11-12', open:  98.0, high:  99.5, low:  97.5, close:  99.0 },
    { time: '2024-11-13', open:  99.0, high: 100.5, low:  98.5, close: 100.0 },
    // RETEST — pulls back to old resistance ($95) which is now support
    { time: '2024-11-14', open: 100.0, high: 100.5, low:  97.5, close:  98.0 },
    { time: '2024-11-15', open:  98.0, high:  98.5, low:  95.5, close:  96.0 },
    { time: '2024-11-18', open:  96.0, high:  97.0, low:  95.0, close:  95.5 }, // Touches old resistance = new support
    // Bounce and continuation
    { time: '2024-11-19', open:  95.5, high:  99.0, low:  95.3, close:  98.5 },
    { time: '2024-11-20', open:  98.5, high: 101.5, low:  98.0, close: 101.0 },
    { time: '2024-11-21', open: 101.0, high: 104.0, low: 100.5, close: 103.5 },
  ],
}

// ─────────────────────────────────────────────
//  SUPPORT & RESISTANCE DRILL CHARTS (sr_*)
// ─────────────────────────────────────────────

const sr_triple_touch = {
  candles: [
    { time: '2025-01-02', open: 52.0, high: 54.5, low: 51.5, close: 53.5 },
    { time: '2025-01-03', open: 53.5, high: 55.5, low: 52.5, close: 55.0 },
    { time: '2025-01-06', open: 55.0, high: 55.5, low: 52.0, close: 52.5 },
    { time: '2025-01-07', open: 52.5, high: 53.0, low: 49.5, close: 50.0 },
    { time: '2025-01-08', open: 50.0, high: 51.0, low: 48.0, close: 49.5 }, // TOUCH 1
    { time: '2025-01-09', open: 49.5, high: 53.0, low: 49.0, close: 52.5 },
    { time: '2025-01-10', open: 52.5, high: 55.5, low: 52.0, close: 55.0 },
    { time: '2025-01-13', open: 55.0, high: 56.0, low: 52.5, close: 53.0 },
    { time: '2025-01-14', open: 53.0, high: 53.5, low: 49.5, close: 50.0 },
    { time: '2025-01-15', open: 50.0, high: 50.5, low: 48.0, close: 48.5 }, // TOUCH 2
    { time: '2025-01-16', open: 48.5, high: 52.5, low: 48.2, close: 52.0 },
    { time: '2025-01-17', open: 52.0, high: 54.5, low: 51.5, close: 54.0 },
    { time: '2025-01-21', open: 54.0, high: 55.5, low: 52.5, close: 53.0 },
    { time: '2025-01-22', open: 53.0, high: 53.5, low: 49.5, close: 50.0 },
    { time: '2025-01-23', open: 50.0, high: 50.5, low: 48.0, close: 48.5 }, // TOUCH 3
    { time: '2025-01-24', open: 48.5, high: 53.0, low: 48.2, close: 52.5 },
    { time: '2025-01-27', open: 52.5, high: 55.5, low: 52.0, close: 55.0 },
    { time: '2025-01-28', open: 55.0, high: 57.5, low: 54.5, close: 57.0 },
  ],
  maLine: [
    { time: '2025-01-02', value: 48.0 },
    { time: '2025-01-08', value: 48.0 },
    { time: '2025-01-15', value: 48.0 },
    { time: '2025-01-23', value: 48.0 },
    { time: '2025-01-28', value: 48.0 },
  ],
}

const sr_support_break = {
  candles: [
    { time: '2025-01-02', open: 66.0, high: 68.0, low: 62.5, close: 65.0 },
    { time: '2025-01-03', open: 65.0, high: 67.0, low: 62.5, close: 66.5 },
    { time: '2025-01-06', open: 66.5, high: 67.5, low: 62.5, close: 63.5 },
    { time: '2025-01-07', open: 63.5, high: 65.0, low: 62.0, close: 64.0 },
    { time: '2025-01-08', open: 64.0, high: 66.5, low: 63.0, close: 66.0 },
    { time: '2025-01-09', open: 66.0, high: 68.0, low: 64.5, close: 67.5 },
    { time: '2025-01-10', open: 67.5, high: 68.5, low: 63.5, close: 64.0 },
    { time: '2025-01-13', open: 64.0, high: 65.0, low: 62.0, close: 62.5 },
    { time: '2025-01-14', open: 62.5, high: 63.5, low: 62.0, close: 62.5 }, // barely holding $62
    { time: '2025-01-15', open: 62.5, high: 63.0, low: 59.0, close: 59.5 }, // BREAK below $62
    { time: '2025-01-16', open: 59.5, high: 62.0, low: 59.0, close: 60.5 }, // bounces toward $62
    { time: '2025-01-17', open: 60.5, high: 62.0, low: 59.0, close: 59.5 }, // $62 now rejects bounce
    { time: '2025-01-21', open: 59.5, high: 60.0, low: 57.0, close: 57.5 },
    { time: '2025-01-22', open: 57.5, high: 58.5, low: 55.5, close: 56.0 },
  ],
  maLine: [
    { time: '2025-01-02', value: 62.0 },
    { time: '2025-01-07', value: 62.0 },
    { time: '2025-01-14', value: 62.0 },
    { time: '2025-01-17', value: 62.0 },
    { time: '2025-01-22', value: 62.0 },
  ],
}

const sr_all_time_high = {
  candles: [
    { time: '2025-01-02', open: 108.0, high: 112.0, low: 107.0, close: 111.0 },
    { time: '2025-01-03', open: 111.0, high: 115.5, low: 110.0, close: 115.0 },
    { time: '2025-01-06', open: 115.0, high: 119.0, low: 114.0, close: 118.5 },
    { time: '2025-01-07', open: 118.5, high: 120.0, low: 116.5, close: 117.0 }, // hits $120, rejects
    { time: '2025-01-08', open: 117.0, high: 117.5, low: 113.0, close: 113.5 },
    { time: '2025-01-09', open: 113.5, high: 115.0, low: 111.0, close: 112.0 },
    { time: '2025-01-10', open: 112.0, high: 114.5, low: 111.0, close: 114.0 },
    { time: '2025-01-13', open: 114.0, high: 116.5, low: 113.5, close: 116.0 },
    { time: '2025-01-14', open: 116.0, high: 118.5, low: 115.5, close: 118.0 },
    { time: '2025-01-15', open: 118.0, high: 120.0, low: 116.5, close: 117.5 }, // approaches $120, stalls again
    { time: '2025-01-16', open: 117.5, high: 118.0, low: 115.5, close: 116.0 },
  ],
  maLine: [
    { time: '2025-01-02', value: 120.0 },
    { time: '2025-01-07', value: 120.0 },
    { time: '2025-01-10', value: 120.0 },
    { time: '2025-01-16', value: 120.0 },
  ],
}

const sr_polarity_flip = {
  candles: [
    { time: '2025-01-02', open: 91.0, high: 94.5, low: 90.5, close: 93.0 },
    { time: '2025-01-03', open: 93.0, high: 95.0, low: 92.0, close: 93.5 }, // hits $95, rejects
    { time: '2025-01-06', open: 93.5, high: 94.0, low: 91.0, close: 91.5 },
    { time: '2025-01-07', open: 91.5, high: 94.5, low: 91.0, close: 94.0 },
    { time: '2025-01-08', open: 94.0, high: 95.0, low: 92.5, close: 93.0 }, // fails at $95 again
    { time: '2025-01-09', open: 93.0, high: 97.5, low: 92.5, close: 97.0 }, // BREAKOUT above $95
    { time: '2025-01-10', open: 97.0, high: 99.5, low: 96.5, close: 99.0 },
    { time: '2025-01-13', open: 99.0, high: 100.5, low: 97.5, close: 100.0 },
    { time: '2025-01-14', open: 100.0, high: 100.5, low: 96.5, close: 97.0 }, // pulls back
    { time: '2025-01-15', open: 97.0, high: 97.5, low: 95.5, close: 96.0 }, // approaching $95
    { time: '2025-01-16', open: 96.0, high: 96.5, low: 95.0, close: 95.5 }, // tests $95, holds
    { time: '2025-01-17', open: 95.5, high: 99.5, low: 95.2, close: 99.0 }, // sharp bounce — polarity flip confirmed
    { time: '2025-01-21', open: 99.0, high: 101.5, low: 98.5, close: 101.0 },
  ],
  maLine: [
    { time: '2025-01-02', value: 95.0 },
    { time: '2025-01-08', value: 95.0 },
    { time: '2025-01-13', value: 95.0 },
    { time: '2025-01-17', value: 95.0 },
    { time: '2025-01-21', value: 95.0 },
  ],
}

const sr_bounce_entry = {
  candles: [
    { time: '2025-01-02', open: 79.0, high: 80.5, low: 77.5, close: 78.5 },
    { time: '2025-01-03', open: 78.5, high: 79.5, low: 75.0, close: 75.5 },
    { time: '2025-01-06', open: 75.5, high: 76.5, low: 72.5, close: 74.0 },
    { time: '2025-01-07', open: 74.0, high: 75.0, low: 72.0, close: 73.0 }, // first support touch
    { time: '2025-01-08', open: 73.0, high: 77.0, low: 72.5, close: 76.5 },
    { time: '2025-01-09', open: 76.5, high: 79.5, low: 76.0, close: 79.0 },
    { time: '2025-01-10', open: 79.0, high: 80.5, low: 77.5, close: 78.0 },
    { time: '2025-01-13', open: 78.0, high: 79.0, low: 75.5, close: 76.0 },
    { time: '2025-01-14', open: 76.0, high: 76.5, low: 73.5, close: 74.0 },
    { time: '2025-01-15', open: 74.0, high: 74.5, low: 72.0, close: 74.0 }, // HAMMER at $72 support
    { time: '2025-01-16', open: 74.0, high: 77.5, low: 73.5, close: 77.0 },
    { time: '2025-01-17', open: 77.0, high: 79.5, low: 76.5, close: 79.0 },
    { time: '2025-01-21', open: 79.0, high: 81.0, low: 78.5, close: 80.5 },
  ],
  maLine: [
    { time: '2025-01-02', value: 72.0 },
    { time: '2025-01-07', value: 72.0 },
    { time: '2025-01-14', value: 72.0 },
    { time: '2025-01-21', value: 72.0 },
  ],
}

const sr_resistance_zone = {
  candles: [
    { time: '2025-01-02', open: 50.5, high: 52.0, low: 49.5, close: 51.5 },
    { time: '2025-01-03', open: 51.5, high: 53.5, low: 51.0, close: 53.0 },
    { time: '2025-01-06', open: 53.0, high: 55.0, low: 52.5, close: 54.5 },
    { time: '2025-01-07', open: 54.5, high: 55.0, low: 52.5, close: 53.0 }, // hits $55, reverses
    { time: '2025-01-08', open: 53.0, high: 53.5, low: 51.0, close: 51.5 },
    { time: '2025-01-09', open: 51.5, high: 52.5, low: 50.5, close: 52.0 },
    { time: '2025-01-10', open: 52.0, high: 54.0, low: 51.5, close: 53.5 },
    { time: '2025-01-13', open: 53.5, high: 56.5, low: 53.0, close: 56.0 },
    { time: '2025-01-14', open: 56.0, high: 56.5, low: 53.5, close: 54.0 }, // hits $56.50, reverses
    { time: '2025-01-15', open: 54.0, high: 54.5, low: 52.0, close: 52.5 },
    { time: '2025-01-16', open: 52.5, high: 53.5, low: 51.5, close: 52.0 },
    { time: '2025-01-17', open: 52.0, high: 53.0, low: 51.0, close: 51.5 },
    { time: '2025-01-21', open: 51.5, high: 53.5, low: 51.0, close: 53.0 },
    { time: '2025-01-22', open: 53.0, high: 55.0, low: 52.5, close: 54.5 },
  ],
  maLine: [
    { time: '2025-01-02', value: 55.0 },
    { time: '2025-01-07', value: 55.0 },
    { time: '2025-01-14', value: 55.0 },
    { time: '2025-01-22', value: 55.0 },
  ],
}

const sr_volume_spike = {
  candles: [
    { time: '2025-01-02', open: 85.0, high: 87.0, low: 80.5, close: 81.5 },
    { time: '2025-01-03', open: 81.5, high: 84.5, low: 81.0, close: 83.5 },
    { time: '2025-01-06', open: 83.5, high: 85.5, low: 83.0, close: 85.0 },
    { time: '2025-01-07', open: 85.0, high: 86.5, low: 83.5, close: 84.0 },
    { time: '2025-01-08', open: 84.0, high: 84.5, low: 82.0, close: 82.5 },
    { time: '2025-01-09', open: 82.5, high: 83.5, low: 81.0, close: 81.5 },
    { time: '2025-01-10', open: 81.5, high: 84.5, low: 79.5, close: 82.0 }, // wide-range battle at $80 support
    { time: '2025-01-13', open: 82.0, high: 85.0, low: 80.5, close: 84.5 }, // closes near high = buyers won
    { time: '2025-01-14', open: 84.5, high: 87.0, low: 84.0, close: 86.5 },
  ],
  maLine: [
    { time: '2025-01-02', value: 80.0 },
    { time: '2025-01-10', value: 80.0 },
    { time: '2025-01-14', value: 80.0 },
  ],
}

// ─────────────────────────────────────────────
//  CHANNEL DRILL CHARTS (ch_*)
// ─────────────────────────────────────────────

const ch_ascending = {
  candles: [
    { time: '2025-02-03', open: 61.0, high: 65.0, low: 60.0, close: 64.5 },
    { time: '2025-02-04', open: 64.5, high: 66.5, low: 63.0, close: 63.5 },
    { time: '2025-02-05', open: 63.5, high: 67.5, low: 63.0, close: 67.0 },
    { time: '2025-02-06', open: 67.0, high: 68.0, low: 64.5, close: 65.0 },
    { time: '2025-02-07', open: 65.0, high: 69.5, low: 64.5, close: 69.0 },
    { time: '2025-02-10', open: 69.0, high: 71.0, low: 67.5, close: 68.0 },
    { time: '2025-02-11', open: 68.0, high: 71.5, low: 67.5, close: 71.0 },
    { time: '2025-02-12', open: 71.0, high: 73.0, low: 69.5, close: 70.0 },
    { time: '2025-02-13', open: 70.0, high: 74.0, low: 69.5, close: 73.5 },
    { time: '2025-02-14', open: 73.5, high: 75.5, low: 72.0, close: 72.5 },
    { time: '2025-02-18', open: 72.5, high: 76.5, low: 72.0, close: 76.0 },
    { time: '2025-02-19', open: 76.0, high: 78.0, low: 74.5, close: 75.0 },
    { time: '2025-02-20', open: 75.0, high: 79.0, low: 74.5, close: 78.5 },
    { time: '2025-02-21', open: 78.5, high: 80.5, low: 77.0, close: 77.5 },
    { time: '2025-02-24', open: 77.5, high: 81.5, low: 77.0, close: 81.0 },
    { time: '2025-02-25', open: 81.0, high: 83.0, low: 79.5, close: 80.0 },
  ],
}

const ch_parallel_lines = {
  candles: [
    { time: '2025-02-03', open: 71.0, high: 75.5, low: 70.0, close: 75.0 },
    { time: '2025-02-04', open: 75.0, high: 76.5, low: 73.0, close: 73.5 },
    { time: '2025-02-05', open: 73.5, high: 78.0, low: 73.0, close: 77.5 },
    { time: '2025-02-06', open: 77.5, high: 79.0, low: 75.5, close: 76.0 },
    { time: '2025-02-07', open: 76.0, high: 80.5, low: 75.5, close: 80.0 },
    { time: '2025-02-10', open: 80.0, high: 81.5, low: 78.0, close: 78.5 },
    { time: '2025-02-11', open: 78.5, high: 83.0, low: 78.0, close: 82.5 },
    { time: '2025-02-12', open: 82.5, high: 84.5, low: 81.0, close: 81.5 },
    { time: '2025-02-13', open: 81.5, high: 86.0, low: 81.0, close: 85.5 },
    { time: '2025-02-14', open: 85.5, high: 87.0, low: 84.0, close: 84.5 },
    { time: '2025-02-18', open: 84.5, high: 89.0, low: 84.0, close: 88.5 },
    { time: '2025-02-19', open: 88.5, high: 90.0, low: 87.0, close: 87.5 },
  ],
}

const ch_pullback_lower = {
  candles: [
    { time: '2025-02-03', open: 59.0, high: 63.5, low: 58.0, close: 63.0 },
    { time: '2025-02-04', open: 63.0, high: 65.0, low: 61.0, close: 61.5 },
    { time: '2025-02-05', open: 61.5, high: 66.5, low: 61.0, close: 66.0 },
    { time: '2025-02-06', open: 66.0, high: 67.5, low: 64.0, close: 64.5 },
    { time: '2025-02-07', open: 64.5, high: 69.5, low: 64.0, close: 69.0 },
    { time: '2025-02-10', open: 69.0, high: 71.0, low: 67.0, close: 67.5 },
    { time: '2025-02-11', open: 67.5, high: 72.5, low: 67.0, close: 72.0 },
    { time: '2025-02-12', open: 72.0, high: 74.0, low: 70.0, close: 70.5 },
    { time: '2025-02-13', open: 70.5, high: 71.5, low: 69.5, close: 70.0 }, // starts pulling back
    { time: '2025-02-14', open: 70.0, high: 71.0, low: 68.5, close: 69.0 },
    { time: '2025-02-18', open: 69.0, high: 70.0, low: 67.5, close: 68.0 }, // at lower channel line
    { time: '2025-02-19', open: 68.0, high: 72.5, low: 67.5, close: 72.0 }, // BOUNCE from lower line
    { time: '2025-02-20', open: 72.0, high: 75.5, low: 71.5, close: 75.0 },
  ],
}

const ch_upper_breakout = {
  candles: [
    { time: '2025-02-03', open: 61.0, high: 65.5, low: 60.5, close: 65.0 },
    { time: '2025-02-04', open: 65.0, high: 66.5, low: 63.0, close: 63.5 },
    { time: '2025-02-05', open: 63.5, high: 68.0, low: 63.0, close: 67.5 },
    { time: '2025-02-06', open: 67.5, high: 69.0, low: 65.5, close: 66.0 },
    { time: '2025-02-07', open: 66.0, high: 70.5, low: 65.5, close: 70.0 },
    { time: '2025-02-10', open: 70.0, high: 72.0, low: 68.0, close: 68.5 },
    { time: '2025-02-11', open: 68.5, high: 73.0, low: 68.0, close: 72.5 },
    { time: '2025-02-12', open: 72.5, high: 74.0, low: 70.5, close: 71.0 },
    { time: '2025-02-13', open: 71.0, high: 75.5, low: 70.5, close: 75.0 },
    { time: '2025-02-14', open: 75.0, high: 76.5, low: 73.0, close: 73.5 },
    { time: '2025-02-18', open: 73.5, high: 80.5, low: 73.0, close: 80.0 }, // BREAKOUT above channel
    { time: '2025-02-19', open: 80.0, high: 84.5, low: 79.5, close: 84.0 }, // acceleration
    { time: '2025-02-20', open: 84.0, high: 87.5, low: 83.5, close: 87.0 },
  ],
}

const ch_descending_break = {
  candles: [
    { time: '2025-02-03', open: 88.0, high: 90.0, low: 85.5, close: 86.0 },
    { time: '2025-02-04', open: 86.0, high: 88.5, low: 85.5, close: 88.0 },
    { time: '2025-02-05', open: 88.0, high: 89.0, low: 84.5, close: 85.0 },
    { time: '2025-02-06', open: 85.0, high: 87.5, low: 84.5, close: 87.0 },
    { time: '2025-02-07', open: 87.0, high: 87.5, low: 83.0, close: 83.5 },
    { time: '2025-02-10', open: 83.5, high: 86.0, low: 83.0, close: 85.5 },
    { time: '2025-02-11', open: 85.5, high: 86.0, low: 81.5, close: 82.0 },
    { time: '2025-02-12', open: 82.0, high: 84.5, low: 81.5, close: 84.0 },
    { time: '2025-02-13', open: 84.0, high: 84.5, low: 80.0, close: 80.5 },
    { time: '2025-02-14', open: 80.5, high: 83.0, low: 80.0, close: 82.5 },
    { time: '2025-02-18', open: 82.5, high: 83.0, low: 77.0, close: 77.5 }, // BREAK below channel
    { time: '2025-02-19', open: 77.5, high: 79.5, low: 76.5, close: 77.0 },
    { time: '2025-02-20', open: 77.0, high: 77.5, low: 74.0, close: 74.5 },
  ],
}

const ch_wedge_vs_channel = {
  candles: [
    { time: '2025-02-03', open: 55.0, high: 60.5, low: 54.0, close: 59.5 }, // wide range
    { time: '2025-02-04', open: 59.5, high: 61.0, low: 57.0, close: 57.5 },
    { time: '2025-02-05', open: 57.5, high: 63.0, low: 57.0, close: 62.5 },
    { time: '2025-02-06', open: 62.5, high: 64.0, low: 60.0, close: 60.5 },
    { time: '2025-02-07', open: 60.5, high: 65.5, low: 60.0, close: 65.0 },
    { time: '2025-02-10', open: 65.0, high: 66.5, low: 63.0, close: 63.5 },
    { time: '2025-02-11', open: 63.5, high: 67.5, low: 63.0, close: 67.0 },
    { time: '2025-02-12', open: 67.0, high: 68.5, low: 65.5, close: 66.0 }, // range narrowing
    { time: '2025-02-13', open: 66.0, high: 69.5, low: 65.5, close: 69.0 },
    { time: '2025-02-14', open: 69.0, high: 70.5, low: 68.0, close: 68.5 },
    { time: '2025-02-18', open: 68.5, high: 71.0, low: 68.0, close: 70.5 },
    { time: '2025-02-19', open: 70.5, high: 71.5, low: 69.0, close: 69.5 }, // apex — converging lines
  ],
}

const ch_measured_move = {
  candles: [
    { time: '2025-02-03', open: 43.0, high: 49.5, low: 42.5, close: 49.0 },
    { time: '2025-02-04', open: 49.0, high: 50.0, low: 46.0, close: 46.5 },
    { time: '2025-02-05', open: 46.5, high: 50.0, low: 46.0, close: 49.5 },
    { time: '2025-02-06', open: 49.5, high: 50.5, low: 46.5, close: 47.0 },
    { time: '2025-02-07', open: 47.0, high: 50.0, low: 42.5, close: 43.0 },
    { time: '2025-02-10', open: 43.0, high: 47.0, low: 42.0, close: 46.5 },
    { time: '2025-02-11', open: 46.5, high: 50.0, low: 46.0, close: 49.5 },
    { time: '2025-02-12', open: 49.5, high: 50.0, low: 46.5, close: 47.0 },
    { time: '2025-02-13', open: 47.0, high: 50.5, low: 46.5, close: 50.0 },
    { time: '2025-02-14', open: 50.0, high: 54.0, low: 49.5, close: 53.5 }, // BREAKOUT above $50
    { time: '2025-02-18', open: 53.5, high: 57.5, low: 53.0, close: 57.0 },
    { time: '2025-02-19', open: 57.0, high: 58.5, low: 56.5, close: 58.0 }, // reaches $58 measured-move target
  ],
  maLine: [
    { time: '2025-02-03', value: 50.0 },
    { time: '2025-02-13', value: 50.0 },
    { time: '2025-02-14', value: 50.0 },
    { time: '2025-02-19', value: 50.0 },
  ],
}

export const CHART_DATA = {
  cr_higher_lows,
  cr_breakout_day,
  cr_gap_fade,
  ema_pullback,
  cr_vcp,
  ss_flat_base,
  ss_failed_breakout,
  tm_bearish_reversal,
  cp_double_top,
  cp_double_bottom,
  cp_ascending_channel,
  cp_descending_channel,
  cp_head_shoulders,
  cp_inv_head_shoulders,
  cp_bull_flag,
  cp_bear_flag,
  cp_hammer,
  cp_shooting_star,
  cp_bullish_engulfing,
  cp_bearish_engulfing,
  cp_support_bounce,
  cp_resistance_rejection,
  cp_breakout_retest,
  sr_triple_touch,
  sr_support_break,
  sr_all_time_high,
  sr_polarity_flip,
  sr_bounce_entry,
  sr_resistance_zone,
  sr_volume_spike,
  ch_ascending,
  ch_parallel_lines,
  ch_pullback_lower,
  ch_upper_breakout,
  ch_descending_break,
  ch_wedge_vs_channel,
  ch_measured_move,
}
