/**
 * The live feed in the browser: ticks the simulated plant, keeps recent readings and alerts, and
 * hands new alerts to the Telegram sender. One shared instance for the whole app.
 */
import { useSyncExternalStore } from 'react'
import { FURNACES, readingAt, telegramText, updateAlerts, type FaultId, type LiveAlert, type LiveReading } from './feed'
import { toast } from '../model/toast'

export type SentMessage = { id: string; text: string; level: LiveAlert['level']; clock: string; delivered: 'preview' | 'sent' | 'failed' }
export type LiveState = {
  running: boolean
  /** Plant minutes per real second. */
  speed: number
  t: number
  startedAt: number
  latest: Record<string, LiveReading>
  history: Record<string, LiveReading[]>
  alerts: LiveAlert[]
  faults: Partial<Record<FaultId, { furnace: string; since: number }>>
  telegram: { mode: 'unknown' | 'preview' | 'live'; messages: SentMessage[] }
  site: string
}

let state: LiveState = {
  running: false, speed: 1, t: 0, startedAt: Date.now(), latest: {}, history: Object.fromEntries(FURNACES.map((f) => [f, []])), alerts: [], faults: {},
  telegram: { mode: 'unknown', messages: [] }, site: 'Steel mini-mill',
}
const listeners = new Set<() => void>()
const emit = () => { for (const l of listeners) l() }
const set = (patch: Partial<LiveState>) => { state = { ...state, ...patch }; emit() }

/** Wall-clock time of a plant minute (the feed starts "now"). */
export const clockOf = (t: number) => new Date(state.startedAt + t * 60_000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/** Try the server's Telegram function once; without a bot token it answers 501 and we stay in preview. */
async function deliver(m: SentMessage): Promise<SentMessage['delivered']> {
  if (state.telegram.mode === 'preview') return 'preview'
  try {
    const res = await fetch('/api/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: m.text }) })
    if (res.status === 501 || res.status === 404 || !(res.headers.get('content-type') ?? '').includes('application/json')) { set({ telegram: { ...state.telegram, mode: 'preview' } }); return 'preview' }
    if (state.telegram.mode !== 'live') set({ telegram: { ...state.telegram, mode: 'live' } })
    return res.ok ? 'sent' : 'failed'
  } catch { set({ telegram: { ...state.telegram, mode: 'preview' } }); return 'preview' }
}

function step() {
  const t = state.t + 1
  const latest = { ...state.latest }, history = { ...state.history }
  let alerts = state.alerts
  const raised: LiveAlert[] = []
  for (const f of FURNACES) {
    const r = readingAt(f, t, state.faults)
    const h = history[f] ?? []
    const u = updateAlerts(alerts, h, r)
    alerts = u.alerts; raised.push(...u.raised)
    history[f] = [...h, r].slice(-240)
    latest[f] = r
  }
  set({ t, latest, history, alerts })
  for (const a of raised) {
    const clock = clockOf(a.t)
    const m: SentMessage = { id: a.id + a.level, text: telegramText(a, state.site, clock), level: a.level, clock, delivered: 'preview' }
    set({ telegram: { ...state.telegram, messages: [...state.telegram.messages, m].slice(-30) } })
    toast(`${a.level === 'alarm' ? 'ALARM' : 'Warning'}: ${a.title}`, a.level === 'alarm' ? 'warn' : 'info')
    void deliver(m).then((delivered) => set({ telegram: { ...state.telegram, messages: state.telegram.messages.map((x) => x.id === m.id ? { ...x, delivered } : x) } }))
  }
}

let timer: ReturnType<typeof setInterval> | null = null
let carry = 0
export const live = {
  start() {
    if (timer) return
    if (state.t === 0) { set({ startedAt: Date.now() - 90 * 60_000 }); for (let k = 0; k < 90; k += 1) step() } // warm up an hour and a half of history
    set({ running: true })
    timer = setInterval(() => { carry += state.speed / 4; while (carry >= 1) { carry -= 1; step() } }, 250)
  },
  stop() { if (timer) clearInterval(timer); timer = null; set({ running: false }) },
  setSpeed(speed: number) { set({ speed }) },
  setSite(site: string) { if (site !== state.site) set({ site }) },
  inject(id: FaultId, furnace: string) { set({ faults: { ...state.faults, [id]: { furnace, since: state.t } } }); toast(`Fault injected on ${furnace}: ${id.replace('-', ' ')}`, 'info') },
  clearFaults() { set({ faults: {} }); toast('All faults cleared', 'info') },
  acknowledge(id: string) { set({ alerts: state.alerts.map((a) => a.id === id ? { ...a, active: false, clearedAt: state.t } : a) }) },
  async sendTest() {
    const m: SentMessage = { id: `test-${Date.now()}`, text: `✅ Test from ChitoCapture · ${state.site}\nAlerts for the melt shop will arrive in this chat.`, level: 'warn', clock: clockOf(state.t), delivered: 'preview' }
    set({ telegram: { ...state.telegram, messages: [...state.telegram.messages, m] } })
    const delivered = await deliver(m)
    set({ telegram: { ...state.telegram, messages: state.telegram.messages.map((x) => x.id === m.id ? { ...x, delivered } : x) } })
    toast(delivered === 'sent' ? 'Test message sent to Telegram' : 'Telegram isn’t connected: shown in the preview only', delivered === 'sent' ? 'ok' : 'info')
  },
}

export const useLive = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => state, () => state)
