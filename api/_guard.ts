import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Shared protection for the public API routes (the leading underscore keeps Vercel from serving this
 * file as a route).
 *
 * 1. Same site only: the browser's Origin must be this deployment's own host (or one listed in
 *    ALLOWED_ORIGINS, comma-separated, e.g. "https://carbonpath.example"). This stops other websites from
 *    using the routes. A script can fake the header, so this is a first fence, not the only one.
 * 2. Per-visitor rate limit by IP address, per minute and per day. Counts live in the function's
 *    memory, so each running copy of the function keeps its own; the Anthropic spend limit and the
 *    Telegram caps are the hard backstops.
 */
const hits = new Map<string, number[]>()
const DAY = 86_400_000

export function guard(req: VercelRequest, res: VercelResponse, name: string, perMinute: number, perDay: number): boolean {
  const origin = String(req.headers.origin ?? '')
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '')
  const extra = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  let sameSite = false
  try { const o = new URL(origin); sameSite = o.host === host || extra.includes(o.origin) } catch { /* no or bad Origin */ }
  if (!sameSite) { res.status(403).json({ error: 'forbidden-origin' }); return false }

  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'unknown'
  const key = `${name}:${ip}`, now = Date.now()
  const list = (hits.get(key) ?? []).filter((t) => now - t < DAY)
  if (list.filter((t) => now - t < 60_000).length >= perMinute || list.length >= perDay) {
    hits.set(key, list)
    res.status(429).json({ error: 'rate-limited' })
    return false
  }
  list.push(now)
  hits.set(key, list)
  if (hits.size > 10_000) hits.clear()
  return true
}
