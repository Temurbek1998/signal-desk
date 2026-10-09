// Texnik indikatorlar. Barcha funksiyalar kiruvchi massiv bilan bir xil uzunlikdagi
// massiv qaytaradi; hisoblab bo'lmaydigan boshlang'ich qiymatlar NaN.

export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// Wilder usulidagi RSI.
export function rsi(values: number[], period = 14): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line = values.map((_, i) => f[i] - s[i]);
  const firstValid = line.findIndex((v) => !Number.isNaN(v));
  const sig = new Array<number>(values.length).fill(NaN);
  if (firstValid >= 0) {
    const tail = ema(line.slice(firstValid), signal);
    tail.forEach((v, j) => (sig[firstValid + j] = v));
  }
  const hist = line.map((v, i) => v - sig[i]);
  return { line, signal: sig, hist };
}

// Wilder usulidagi ATR.
export function atr(candles: { h: number; l: number; c: number }[], period = 14): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (candles.length <= period) return out;
  const tr = candles.map((c, i) =>
    i === 0 ? c.h - c.l : Math.max(c.h - c.l, Math.abs(c.h - candles[i - 1].c), Math.abs(c.l - candles[i - 1].c)),
  );
  let prev = 0;
  for (let i = 1; i <= period; i++) prev += tr[i];
  prev /= period;
  out[period] = prev;
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

// Wilder usulidagi ADX: trend kuchi (yo'nalishidan qat'i nazar). 20 dan yuqori — trend bor.
export function adx(candles: { h: number; l: number; c: number }[], period = 14): number[] {
  const n = candles.length;
  const out = new Array<number>(n).fill(NaN);
  if (n <= period * 2) return out;
  let tr = 0, pdm = 0, mdm = 0;
  const dx: number[] = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    const c = candles[i], p = candles[i - 1];
    const up = c.h - p.h, down = p.l - c.l;
    const t = Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c));
    const pd = up > down && up > 0 ? up : 0;
    const md = down > up && down > 0 ? down : 0;
    if (i <= period) {
      tr += t; pdm += pd; mdm += md;
      if (i < period) continue;
    } else {
      tr = tr - tr / period + t;
      pdm = pdm - pdm / period + pd;
      mdm = mdm - mdm / period + md;
    }
    const pdi = tr ? (100 * pdm) / tr : 0;
    const mdi = tr ? (100 * mdm) / tr : 0;
    dx[i] = pdi + mdi ? (100 * Math.abs(pdi - mdi)) / (pdi + mdi) : 0;
  }
  let sum = 0;
  for (let i = period; i < period * 2; i++) sum += dx[i];
  let prev = sum / period;
  out[period * 2 - 1] = prev;
  for (let i = period * 2; i < n; i++) {
    prev = (prev * (period - 1) + dx[i]) / period;
    out[i] = prev;
  }
  return out;
}
