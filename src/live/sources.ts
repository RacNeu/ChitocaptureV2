/**
 * Real connection for live data: Supabase (readings stored by the 24/7 ingest function, pushed to
 * the app by Realtime). Settings come from Vite env vars
 * (.env.local / Vercel), and can be overridden per browser on Settings → Live data & alerts.
 */
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import type { LiveReading } from './feed'

/**
 * demoKey is the DEMO ingest key: it ships in the website, so the ingest function only lets it write
 * to site "demo", in small rate-limited batches. Real devices use the private device key, which never
 * goes in the website.
 */
export type LiveConfig = { supabaseUrl: string; supabaseKey: string; demoKey: string; site: string }
const KEY = 'chitocapture.live.config.v2'
const env = import.meta.env as Record<string, string | undefined>

export function loadConfig(): LiveConfig {
  let saved: Partial<LiveConfig> = {}
  try { saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { /* private mode */ }
  return {
    supabaseUrl: saved.supabaseUrl || env.VITE_SUPABASE_URL || '',
    supabaseKey: saved.supabaseKey || env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
    demoKey: saved.demoKey || env.VITE_DEMO_INGEST_KEY || '',
    site: saved.site || 'demo',
  }
}
export function saveConfig(c: LiveConfig) { try { localStorage.setItem(KEY, JSON.stringify(c)) } catch { /* ignore */ } }

/** The JSON a device sends to the ingest function. */
export type DeviceReading = { furnace: string; at?: string; phase?: string; kw?: number; hz?: number; bathC?: number | null; waterInC?: number; waterOutC?: number; flowM3h?: number; leakMA?: number }
export const toDevice = (r: LiveReading, at: string): DeviceReading => ({ furnace: r.furnace, at, phase: r.phase, kw: Math.round(r.kw), hz: r.hz, bathC: r.bathC, waterInC: r.waterInC, waterOutC: r.waterOutC, flowM3h: r.flowM3h, leakMA: r.leakMA })

/* ---------------- Supabase ---------------- */

let sb: SupabaseClient | null = null, sbUrl = ''
function client(c: LiveConfig) {
  if (!c.supabaseUrl || !c.supabaseKey) return null
  if (!sb || sbUrl !== c.supabaseUrl + c.supabaseKey) { sb = createClient(c.supabaseUrl, c.supabaseKey, { auth: { persistSession: false } }); sbUrl = c.supabaseUrl + c.supabaseKey }
  return sb
}
export type ReadingRow = { furnace: string; at: string; phase: string | null; kw: number | null; hz: number | null; bath_c: number | null; water_in_c: number | null; water_out_c: number | null; flow_m3h: number | null; leak_ma: number | null }
export type AlertRow = { id: number; furnace: string; rule: string; level: 'warn' | 'alarm'; title: string; detail: string; action: string | null; raised_at: string; cleared_at: string | null; telegram: string }

export async function supabaseSubscribe(c: LiveConfig, on: { readings: (rows: ReadingRow[]) => void; alert: (row: AlertRow) => void; status: (s: string) => void }): Promise<() => void> {
  const db = client(c)
  if (!db) { on.status('Not configured'); return () => undefined }
  on.status('Connecting…')
  const since = new Date(Date.now() - 2 * 3_600_000).toISOString()
  const [{ data: rows, error }, { data: alerts }] = await Promise.all([
    db.from('readings').select('furnace, at, phase, kw, hz, bath_c, water_in_c, water_out_c, flow_m3h, leak_ma').eq('site', c.site).gte('at', since).order('at', { ascending: true }).limit(5_000),
    db.from('alerts').select('*').eq('site', c.site).order('raised_at', { ascending: false }).limit(40),
  ])
  if (error) { on.status(`Error: ${error.message}`); return () => undefined }
  on.readings((rows ?? []) as ReadingRow[])
  for (const a of ((alerts ?? []) as AlertRow[]).reverse()) on.alert(a)
  const channel: RealtimeChannel = db.channel(`live-${c.site}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'readings', filter: `site=eq.${c.site}` }, (p) => on.readings([p.new as ReadingRow]))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts', filter: `site=eq.${c.site}` }, (p) => on.alert(p.new as AlertRow))
    .subscribe((s) => on.status(s === 'SUBSCRIBED' ? 'Connected' : s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' ? `Error: ${s.toLowerCase()}` : 'Connecting…'))
  return () => { void db.removeChannel(channel) }
}

/** Post the test publisher's readings to the 24/7 ingest function with the demo key (site "demo"). */
export async function ingest(c: LiveConfig, readings: DeviceReading[]) {
  if (!c.supabaseUrl || !c.demoKey) return { ok: false, error: 'Not configured' }
  try {
    const r = await fetch(`${c.supabaseUrl}/functions/v1/ingest`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ingest-key': c.demoKey, 'x-source': 'simulator' }, body: JSON.stringify({ site: 'demo', readings }) })
    const body = await r.json().catch(() => ({}))
    return r.ok ? { ok: true, raised: (body.raised ?? []) as string[] } : { ok: false, error: body.error ?? `HTTP ${r.status}` }
  } catch (e) { return { ok: false, error: (e as Error).message } }
}
