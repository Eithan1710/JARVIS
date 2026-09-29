/**
 * Deterministic statistics. The AI never does arithmetic — it interprets these results.
 * All functions ignore null/NaN inputs.
 */

export type Num = number | null | undefined;

export function clean(xs: Num[]): number[] {
  return xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
}

export function sum(xs: Num[]): number {
  return clean(xs).reduce((a, b) => a + b, 0);
}

export function mean(xs: Num[]): number | null {
  const c = clean(xs);
  return c.length ? c.reduce((a, b) => a + b, 0) / c.length : null;
}

export function median(xs: Num[]): number | null {
  const c = clean(xs).sort((a, b) => a - b);
  if (!c.length) return null;
  const mid = Math.floor(c.length / 2);
  return c.length % 2 ? c[mid] : (c[mid - 1] + c[mid]) / 2;
}

export function variance(xs: Num[]): number | null {
  const c = clean(xs);
  if (c.length < 2) return null;
  const m = c.reduce((a, b) => a + b, 0) / c.length;
  return c.reduce((a, b) => a + (b - m) ** 2, 0) / (c.length - 1);
}

export function stdev(xs: Num[]): number | null {
  const v = variance(xs);
  return v == null ? null : Math.sqrt(v);
}

export function round(x: number | null | undefined, digits = 2): number | null {
  if (x == null || !Number.isFinite(x)) return null;
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

export interface Summary {
  n: number;
  mean: number | null;
  median: number | null;
  stdev: number | null;
  min: number | null;
  max: number | null;
}

export function summarize(xs: Num[]): Summary {
  const c = clean(xs);
  return {
    n: c.length,
    mean: round(mean(c)),
    median: round(median(c)),
    stdev: round(stdev(c)),
    min: c.length ? Math.min(...c) : null,
    max: c.length ? Math.max(...c) : null,
  };
}

/** Pairs where both values are present. */
export function pairs(xs: Num[], ys: Num[]): [number, number][] {
  const out: [number, number][] = [];
  const n = Math.min(xs.length, ys.length);
  for (let i = 0; i < n; i++) {
    const x = xs[i];
    const y = ys[i];
    if (typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)) out.push([x, y]);
  }
  return out;
}

export function pearson(xs: Num[], ys: Num[]): { r: number | null; n: number } {
  const p = pairs(xs, ys);
  const n = p.length;
  if (n < 3) return { r: null, n };
  const mx = p.reduce((a, [x]) => a + x, 0) / n;
  const my = p.reduce((a, [, y]) => a + y, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const [x, y] of p) {
    num += (x - mx) * (y - my);
    dx += (x - mx) ** 2;
    dy += (y - my) ** 2;
  }
  if (dx === 0 || dy === 0) return { r: null, n };
  return { r: num / Math.sqrt(dx * dy), n };
}

function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

/** Spearman rank correlation — robust to outliers and non-linear monotonic relations. */
export function spearman(xs: Num[], ys: Num[]): { r: number | null; n: number } {
  const p = pairs(xs, ys);
  if (p.length < 3) return { r: null, n: p.length };
  return pearson(ranks(p.map(([x]) => x)), ranks(p.map(([, y]) => y)));
}

/** OLS slope of y over index (per step). */
export function linearTrend(ys: Num[]): { slope: number | null; r2: number | null; n: number } {
  const pts: [number, number][] = [];
  ys.forEach((y, i) => {
    if (typeof y === "number" && Number.isFinite(y)) pts.push([i, y]);
  });
  const n = pts.length;
  if (n < 3) return { slope: null, r2: null, n };
  const mx = pts.reduce((a, [x]) => a + x, 0) / n;
  const my = pts.reduce((a, [, y]) => a + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [x, y] of pts) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  if (sxx === 0) return { slope: null, r2: null, n };
  const slope = sxy / sxx;
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { slope, r2, n };
}

/** Cohen's d with pooled standard deviation. */
export function cohensD(a: Num[], b: Num[]): number | null {
  const ca = clean(a);
  const cb = clean(b);
  if (ca.length < 2 || cb.length < 2) return null;
  const va = variance(ca)!;
  const vb = variance(cb)!;
  const pooled = Math.sqrt(((ca.length - 1) * va + (cb.length - 1) * vb) / (ca.length + cb.length - 2));
  if (pooled === 0) return null;
  return (mean(ca)! - mean(cb)!) / pooled;
}

export interface GroupComparison {
  a: Summary;
  b: Summary;
  diff: number | null;
  /** (a - b) / |b| */
  relDiff: number | null;
  d: number | null;
}

export function compareGroups(a: Num[], b: Num[]): GroupComparison {
  const sa = summarize(a);
  const sb = summarize(b);
  const diff = sa.mean != null && sb.mean != null ? sa.mean - sb.mean : null;
  const relDiff = diff != null && sb.mean ? diff / Math.abs(sb.mean) : null;
  return { a: sa, b: sb, diff: round(diff), relDiff: round(relDiff, 3), d: round(cohensD(a, b)) };
}

/**
 * Single change-point: the split index that maximises the between-segment mean difference
 * (scaled by within-segment spread). Returns null when no split is meaningful.
 */
export function changePoint(ys: Num[], minSegment = 7): { index: number; before: number; after: number; d: number } | null {
  const idx: number[] = [];
  const vals: number[] = [];
  ys.forEach((y, i) => {
    if (typeof y === "number" && Number.isFinite(y)) {
      idx.push(i);
      vals.push(y);
    }
  });
  if (vals.length < minSegment * 2) return null;
  let best: { index: number; before: number; after: number; d: number } | null = null;
  for (let k = minSegment; k <= vals.length - minSegment; k++) {
    const d = cohensD(vals.slice(k), vals.slice(0, k));
    if (d == null) continue;
    if (!best || Math.abs(d) > Math.abs(best.d)) {
      best = { index: idx[k], before: mean(vals.slice(0, k))!, after: mean(vals.slice(k))!, d };
    }
  }
  return best && Math.abs(best.d) >= 0.8 ? best : null;
}

export function describeEffect(d: number | null): "none" | "small" | "moderate" | "large" {
  if (d == null) return "none";
  const a = Math.abs(d);
  if (a < 0.2) return "none";
  if (a < 0.5) return "small";
  if (a < 0.8) return "moderate";
  return "large";
}

export function describeCorrelation(r: number | null): "none" | "weak" | "moderate" | "strong" {
  if (r == null) return "none";
  const a = Math.abs(r);
  if (a < 0.2) return "none";
  if (a < 0.4) return "weak";
  if (a < 0.6) return "moderate";
  return "strong";
}

export const EFFECT_LABEL: Record<ReturnType<typeof describeEffect>, string> = { none: "זניח", small: "קטן", moderate: "בינוני", large: "גדול" };
