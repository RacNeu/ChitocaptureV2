/** Small statistics helpers shared by the melt-shop models. */

export const mean = (v: number[]) => v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0
export function quantile(v: number[], q: number) {
  const s = [...v].sort((a, b) => a - b)
  if (!s.length) return 0
  const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i)
  return s[lo] + (s[hi] - s[lo]) * (i - lo)
}
export const median = (v: number[]) => quantile(v, 0.5)

/** Inverse by Gauss-Jordan; null if singular. */
export function invert(m: number[][]): number[][] | null {
  const n = m.length
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  for (let c = 0; c < n; c += 1) {
    let p = c
    for (let r = c + 1; r < n; r += 1) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r
    if (Math.abs(a[p][c]) < 1e-12) return null
    ;[a[c], a[p]] = [a[p], a[c]]
    const d = a[c][c]
    for (let j = 0; j < 2 * n; j += 1) a[c][j] /= d
    for (let r = 0; r < n; r += 1) if (r !== c) { const f = a[r][c]; for (let j = 0; j < 2 * n; j += 1) a[r][j] -= f * a[c][j] }
  }
  return a.map((row) => row.slice(n))
}

export type Ols = { beta: number[]; se: number[]; cov: number[][]; r2: number; residualSd: number; n: number }

/** Ordinary least squares with an intercept; X rows exclude the intercept column. */
export function ols(X: number[][], y: number[]): Ols | null {
  const n = y.length, k = (X[0]?.length ?? 0) + 1
  if (n <= k) return null
  const Z = X.map((r) => [1, ...r])
  const xtx = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => Z.reduce((s, r) => s + r[i] * r[j], 0)))
  const inv = invert(xtx)
  if (!inv) return null
  const xty = Array.from({ length: k }, (_, i) => Z.reduce((s, r, idx) => s + r[i] * y[idx], 0))
  const beta = inv.map((row) => row.reduce((s, v, j) => s + v * xty[j], 0))
  const fitted = Z.map((r) => r.reduce((s, v, j) => s + v * beta[j], 0))
  const sse = y.reduce((s, v, i) => s + (v - fitted[i]) ** 2, 0)
  const ym = mean(y), sst = y.reduce((s, v) => s + (v - ym) ** 2, 0)
  const s2 = sse / (n - k)
  const cov = inv.map((row) => row.map((v) => v * s2))
  return { beta, se: cov.map((row, i) => Math.sqrt(Math.max(0, row[i]))), cov, r2: sst > 0 ? 1 - sse / sst : 0, residualSd: Math.sqrt(s2), n }
}

/** 90% two-sided normal multiplier. */
export const Z90 = 1.645

/** Deterministic pseudo-random numbers (for demo data and tests). */
export function seeded(seed: number) {
  let s = seed >>> 0
  const next = () => { s = (s * 1_664_525 + 1_013_904_223) >>> 0; return s / 4_294_967_296 }
  const gauss = () => { const u = Math.max(1e-9, next()), v = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }
  return { next, gauss, range: (a: number, b: number) => a + (b - a) * next() }
}
