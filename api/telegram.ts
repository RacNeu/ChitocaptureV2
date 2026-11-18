import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from './_guard.js'

/**
 * POST /api/telegram — the website's "Send test" button and the simulated plant's alerts.
 * Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Vercel → Project → Settings → Environment Variables
 * (type Secret). Without them this returns 501 and the app shows alerts in its Telegram preview.
 *
 * The browser can't send free text: it sends a message KIND and the server writes the words from
 * fixed templates, so nobody can use the bot to post their own messages. Only the website's own
 * pages may call it (see _guard.ts), a few times a minute per visitor, and each running copy of the
 * function sends at most 30 messages an hour.
 * Real 24/7 plant alerts don't come through here: the Supabase ingest function sends those.
 *
 * Body: { kind: "test" } or { kind: "alert", furnace: "IF1"–"IF4", rule, level: "warn" | "alarm", value? }
 */
const RULES: Record<string, { title: string; detail: (v: number | null) => string; action: string }> = {
  flow: { title: 'coil water flow low', detail: (v) => v === null ? 'Flow below 300 m³/h' : `Flow ${Math.round(v)} m³/h (min 300)`, action: 'Check coil cooling pumps, filters and hoses; cut power until flow is back.' },
  outlet: { title: 'coil water outlet hot', detail: (v) => v === null ? 'Outlet above 55 °C' : `Outlet ${v} °C (max 55)`, action: 'Reduce power and check cooling-tower temperature and flow.' },
  dt: { title: 'coil water ΔT high', detail: (v) => v === null ? 'ΔT above 20 °C' : `ΔT ${v} °C (warn above 20)`, action: 'Watch the coil water; check flow and the heat exchanger.' },
  leak: { title: 'earth leakage', detail: (v) => v === null ? 'Leakage above 15 mA' : `${v} mA (warn above 15, alarm above 25)`, action: 'Stop melting and inspect the lining: metal may be close to the coil.' },
  bath: { title: 'bath over tap aim', detail: (v) => v === null ? 'Bath more than 30 °C over aim' : `Bath ${Math.round(v)} °C`, action: 'Lower power or tap now: every °C over aim costs energy.' },
  anomaly: { title: 'unusual reading', detail: () => 'Outside this furnace’s normal band', action: 'Look at this signal’s trend on the HMI (F3).' },
}
const HOUR = 3_600_000
let sent: number[] = []

/**
 * People to tag, from server settings only (never from the browser):
 *   TELEGRAM_MENTIONS        tagged on every message, e.g. "@aiman_eng @meiling_sus"
 *   TELEGRAM_MENTIONS_ALARM  also tagged on alarms, e.g. "@plant_manager"
 * Only real Telegram usernames (@ + 5–32 letters, digits or _) are kept; anything else is ignored.
 */
export function mentions(level: 'warn' | 'alarm' | 'test', env: Record<string, string | undefined> = process.env): string {
  const pick = (v?: string) => (v ?? '').split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^@[A-Za-z0-9_]{5,32}$/.test(s))
  const names = [...pick(env.TELEGRAM_MENTIONS), ...(level === 'warn' ? [] : pick(env.TELEGRAM_MENTIONS_ALARM))]
  return [...new Set(names)].join(' ')
}
const withMentions = (text: string, level: 'warn' | 'alarm' | 'test') => { const m = mentions(level); return m ? `${text}\n👷 ${m}` : text }

function message(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (b.kind === 'test') return withMentions('✅ Test from ChitoCapture\nAlerts for the melt shop will arrive in this chat.', 'test')
  if (b.kind !== 'alert') return null
  const rule = typeof b.rule === 'string' ? RULES[b.rule] : undefined
  if (!rule || typeof b.furnace !== 'string' || !/^IF[1-4]$/.test(b.furnace) || (b.level !== 'warn' && b.level !== 'alarm')) return null
  const value = typeof b.value === 'number' && Number.isFinite(b.value) && Math.abs(b.value) < 10_000 ? Math.round(b.value * 10) / 10 : null
  const clock = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit' })
  return withMentions(`🧪 DEMO (simulated plant)\n${b.level === 'alarm' ? '🚨 ALARM' : '⚠️ WARNING'} · ${b.furnace} ${rule.title}\n${rule.detail(value)}\nTime ${clock}\n➡️ ${rule.action}`, b.level as 'warn' | 'alarm')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method-not-allowed' }); return }
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID
  if (!token || !chat) { res.status(501).json({ error: 'not-configured' }); return }
  if (!guard(req, res, 'telegram', 6, 60)) return
  const text = message(req.body)
  if (!text) { res.status(400).json({ error: 'bad-request' }); return }
  sent = sent.filter((t) => Date.now() - t < HOUR)
  if (sent.length >= 30) { res.status(429).json({ error: 'rate-limited' }); return }
  sent.push(Date.now())
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    })
    if (!r.ok) { res.status(502).json({ error: `telegram-${r.status}` }); return }
    res.status(200).json({ ok: true })
  } catch {
    res.status(502).json({ error: 'telegram-unreachable' })
  }
}
