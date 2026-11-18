/**
 * The live feed in the browser. Readings come from one source at a time:
 * - 'sim': the simulated plant (src/live/feed.ts), alerts from the local engine
 * - 'supabase': readings stored by the 24/7 ingest function, pushed by Realtime; alerts from the server
 * The simulated plant can also act as the devices ("test publisher"), sending its readings out
 * through Supabase, so the full cloud path can be demonstrated without hardware.
 */
import { useSyncExternalStore } from 'react'
import { FURNACES, readingAt, telegramText, updateAlerts, type FaultId, type LiveAlert, type LiveReading } from './feed'
import { ingest, loadConfig, saveConfig, supabaseSubscribe, toDevice, type AlertRow, type DeviceReading, type LiveConfig, type ReadingRow } from './sources'
import { toast } from '../model/toast'

export type Source = 'sim' | 'supabase'
/** What the server needs to write the Telegram message itself (it never accepts free text). */
export type TelegramPayload = { kind: 'test' } | { kind: 'alert'; furnace: string; rule: string; level: LiveAlert['level']; value?: number }
export type SentMessage = { id: string; text: string; level: LiveAlert['level']; clock: string; delivered: 'preview' | 'sent' | 'failed'; payload?: TelegramPayload }
export type LiveState = {
  running: boolean
  speed: number
  t: number
  startedAt: number
  latest: Record<string, LiveReading>
  history: Record<string, LiveReading[]>
  alerts: LiveAlert[]
  faults: Partial<Record<FaultId, { furnace: string; since: number }>>
  telegram: { mode: 'unknown' | 'preview' | 'live'; messages: SentMessage[] }
  site: string
  source: Source
  status: { supabase: string }
  publish: { supabase: boolean; sent: number; last: string }
  config: LiveConfig
}

const empty = () => ({ latest: {}, history: Object.fromEntries(FURNACES.map((f) => [f, []])) as Record<string, LiveReading[]>, alerts: [] as LiveAlert[] })
let state: LiveState = {
  running: false, speed: 1, t: 0, startedAt: Date.now(), ...empty(), faults: {},
  telegram: { mode: 'unknown', messages: [] }, site: 'Steel mini-mill',
  source: 'sim', status: { supabase: 'Off' }, publish: { supabase: false, sent: 0, last: '' }, config: loadConfig(),
}
const listeners = new Set<() => void>()
const emit = () => { for (const l of listeners) l() }
const set = (patch: Partial<LiveState>) => { state = { ...state, ...patch }; emit() }

/** Wall-clock time of a plant minute. */
export const clockOf = (t: number) => new Date(state.startedAt + t * 60_000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/* ---------------- Telegram ---------------- */

async function deliver(m: SentMessage): Promise<SentMessage['delivered']> {
  if (state.telegram.mode === 'preview' || !m.payload) return 'preview'
  try {
    const res = await fetch('/api/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m.payload) })
    if (res.status === 501 || res.status === 404 || !(res.headers.get('content-type') ?? '').includes('application/json')) { set({ telegram: { ...state.telegram, mode: 'preview' } }); return 'preview' }
    if (state.telegram.mode !== 'live') set({ telegram: { ...state.telegram, mode: 'live' } })
    return res.ok ? 'sent' : 'failed'
  } catch { set({ telegram: { ...state.telegram, mode: 'preview' } }); return 'preview' }
}
const addMessage = (m: SentMessage) => set({ telegram: { ...state.telegram, messages: [...state.telegram.messages.filter((x) => x.id !== m.id), m].slice(-30) } })

/* ---------------- Readings in ---------------- */

/** Local alert engine (simulator source). */
function apply(readings: LiveReading[], localAlerts: boolean) {
  const latest = { ...state.latest }, history = { ...state.history }
  let alerts = state.alerts
  const raised: LiveAlert[] = []
  for (const r of readings) {
    const h = history[r.furnace] ?? []
    if (localAlerts) { const u = updateAlerts(alerts, h, r); alerts = u.alerts; raised.push(...u.raised) }
    history[r.furnace] = [...h, r].slice(-240)
    latest[r.furnace] = r
  }
  set({ latest, history, alerts })
  for (const a of raised) {
    const value = Number(a.detail.match(/-?\d+(\.\d+)?/)?.[0])
    const payload: TelegramPayload = { kind: 'alert', furnace: a.furnace, rule: a.key.split(':')[1], level: a.level, ...(Number.isFinite(value) ? { value } : {}) }
    const m: SentMessage = { id: a.id + a.level, text: telegramText(a, state.site, clockOf(a.t)), level: a.level, clock: clockOf(a.t), delivered: 'preview', payload }
    addMessage(m)
    toast(`${a.level === 'alarm' ? 'ALARM' : 'Warning'}: ${a.title}`, a.level === 'alarm' ? 'warn' : 'info')
    void deliver(m).then((delivered) => addMessage({ ...m, delivered }))
  }
}

/** A reading from a device (via Supabase) in the app's format. */
function fromDevice(d: DeviceReading, at: string): LiveReading {
  const prev = state.latest[d.furnace]
  const kw = d.kw ?? 0
  const phase = (d.phase as LiveReading['phase']) ?? (kw > 15_000 ? 'melting' : (d.bathC ?? 0) > 1_400 ? 'holding' : 'charging')
  const heatNo = (prev?.heatNo ?? 1) + (prev && (prev.phase === 'tapping' || prev.phase === 'holding') && (phase === 'charging' || phase === 'melting') ? 1 : 0)
  return {
    t: (Date.parse(at) - state.startedAt) / 60_000, furnace: d.furnace, phase, kw, hz: d.hz ?? 0, bathC: d.bathC ?? null,
    waterInC: d.waterInC ?? 0, waterOutC: d.waterOutC ?? 0, flowM3h: d.flowM3h ?? 0, leakMA: d.leakMA ?? 0, heatNo,
  }
}
const rowToDevice = (r: ReadingRow): DeviceReading => ({ furnace: r.furnace, phase: r.phase ?? undefined, kw: r.kw ?? undefined, hz: r.hz ?? undefined, bathC: r.bath_c, waterInC: r.water_in_c ?? undefined, waterOutC: r.water_out_c ?? undefined, flowM3h: r.flow_m3h ?? undefined, leakMA: r.leak_ma ?? undefined })

function serverAlert(a: AlertRow) {
  const t = (Date.parse(a.raised_at) - state.startedAt) / 60_000
  const alert: LiveAlert = { id: `db-${a.id}`, key: `${a.furnace}:${a.rule}`, furnace: a.furnace, level: a.level, title: a.title, detail: a.detail, action: a.action ?? '', t, active: !a.cleared_at, clearedAt: a.cleared_at ? (Date.parse(a.cleared_at) - state.startedAt) / 60_000 : undefined }
  const isNew = !state.alerts.some((x) => x.id === alert.id)
  set({ alerts: [...state.alerts.filter((x) => x.id !== alert.id), alert].slice(-60) })
  const delivered: SentMessage['delivered'] = a.telegram === 'sent' ? 'sent' : a.telegram === 'failed' ? 'failed' : 'preview'
  if (a.telegram !== 'pending') addMessage({ id: `db-${a.id}-${a.level}`, text: telegramText(alert, state.config.site, clockOf(t)), level: a.level, clock: clockOf(t), delivered })
  if (isNew && alert.active && Date.now() - Date.parse(a.raised_at) < 120_000) toast(`${a.level === 'alarm' ? 'ALARM' : 'Warning'} from the cloud: ${a.title}`, a.level === 'alarm' ? 'warn' : 'info')
}

/* ---------------- The simulated plant (and test publisher) ---------------- */

/** The test publisher sends each furnace's latest reading at most every 2 s (the demo key is rate-limited). */
const PUBLISH_MS = 2_000
let lastPublish = 0, publishing = false
function publish(devices: DeviceReading[]) {
  if (publishing || Date.now() - lastPublish < PUBLISH_MS) return
  publishing = true; lastPublish = Date.now()
  void ingest(state.config, devices).then((r) => {
    publishing = false
    set({ publish: { ...state.publish, sent: state.publish.sent + (r.ok ? devices.length : 0), last: r.ok ? `Sent ${devices.length} readings · ${new Date().toLocaleTimeString('en-GB')}` : `Not sent: ${r.error}` } })
  })
}
function step() {
  const t = state.t + 1
  const rs = FURNACES.map((f) => readingAt(f, t, state.faults))
  set({ t })
  if (state.source === 'sim') apply(rs, true)
  const at = new Date(state.startedAt + t * 60_000).toISOString()
  const devices = rs.map((r) => toDevice(r, at))
  if (state.publish.supabase) publish(devices)
}

let timer: ReturnType<typeof setInterval> | null = null
let carry = 0
let disconnect: (() => void) | null = null

export const live = {
  start() {
    if (timer) return
    if (state.t === 0 && state.source === 'sim') { set({ startedAt: Date.now() - 90 * 60_000 }); for (let k = 0; k < 90; k += 1) step() }
    set({ running: true })
    timer = setInterval(() => { carry += state.speed / 4; while (carry >= 1) { carry -= 1; step() } }, 250)
  },
  stop() { if (timer) clearInterval(timer); timer = null; set({ running: false }) },
  setSpeed(speed: number) { set({ speed }) },
  setSite(site: string) { if (site !== state.site) set({ site }) },
  inject(id: FaultId, furnace: string) { set({ faults: { ...state.faults, [id]: { furnace, since: state.t } } }); toast(`Fault injected on ${furnace}: ${id.replace('-', ' ')}`, 'info') },
  clearFaults() { set({ faults: {} }); toast('All faults cleared', 'info') },
  acknowledge(id: string) { set({ alerts: state.alerts.map((a) => a.id === id ? { ...a, active: false, clearedAt: state.t } : a) }) },
  saveConfig(c: LiveConfig) { saveConfig(c); set({ config: c }); toast('Connection settings saved', 'ok') },

  /** Choose where the live screens read from. */
  async useSource(source: Source) {
    disconnect?.(); disconnect = null
    set({ source, ...empty(), status: { supabase: source === 'supabase' ? 'Connecting…' : 'Off' } })
    if (source === 'sim') { set({ startedAt: Date.now() - state.t * 60_000 }); return }
    // External data is real time: minute 0 is two hours ago.
    if (!timer) set({ startedAt: Date.now() - 120 * 60_000, t: 120 })
    disconnect = await supabaseSubscribe(state.config, {
      readings: (rows) => apply(rows.map((r) => fromDevice(rowToDevice(r), r.at)), false),
      alert: serverAlert,
      status: (st) => set({ status: { supabase: st } }),
    })
  },
  /** The simulated plant sends its readings out, as devices would. */
  setPublish(on: boolean) {
    set({ publish: { ...state.publish, supabase: on } })
    if (on) live.start()
  },
  async sendTest() {
    const m: SentMessage = { id: `test-${Date.now()}`, text: '✅ Test from ChitoCapture\nAlerts for the melt shop will arrive in this chat.', level: 'warn', clock: clockOf(state.t), delivered: 'preview', payload: { kind: 'test' } }
    addMessage(m)
    const delivered = await deliver(m)
    addMessage({ ...m, delivered })
    toast(delivered === 'sent' ? 'Test message sent to Telegram' : 'Telegram isn’t connected: shown in the preview only', delivered === 'sent' ? 'ok' : 'info')
  },
}

export const useLive = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => state, () => state)
