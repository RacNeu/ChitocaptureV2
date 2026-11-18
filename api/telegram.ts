import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * POST /api/telegram — sends a melt-shop alert to the plant's Telegram group.
 * Set TELEGRAM_BOT_TOKEN (from @BotFather) and TELEGRAM_CHAT_ID (the group) in Vercel → Project →
 * Settings → Environment Variables. Optionally set ALERT_API_KEY and send it as the x-alert-key
 * header so only your app or gateway can post. Without a token this returns 501 and the app shows
 * alerts in its Telegram preview instead.
 *
 * In production the 24/7 alert worker (or the plant gateway) calls this, not the browser: see
 * docs/live-monitoring.md.
 */
const MAX = 1_000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method-not-allowed' }); return }
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID
  if (!token || !chat) { res.status(501).json({ error: 'not-configured' }); return }
  if (process.env.ALERT_API_KEY && req.headers['x-alert-key'] !== process.env.ALERT_API_KEY) { res.status(401).json({ error: 'unauthorised' }); return }
  const text = typeof req.body?.text === 'string' ? req.body.text.slice(0, MAX).trim() : ''
  if (!text) { res.status(400).json({ error: 'bad-request' }); return }
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
