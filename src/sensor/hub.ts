import { useSyncExternalStore } from 'react'
import { parseLine, type Reading } from './parse'

/** Minimal Web Serial typings (Chrome and Edge only; not in the TypeScript DOM library). */
type SerialPortLike = {
  open: (options: { baudRate: number }) => Promise<void>
  close: () => Promise<void>
  readable: ReadableStream<Uint8Array> | null
}
type SerialLike = { requestPort: () => Promise<SerialPortLike> }

export type SensorStatus = 'off' | 'simulated' | 'connecting' | 'live' | 'error'
export type SimMode = 'duct'

export type Point = { at: number } & Reading

export type SensorState = {
  status: SensorStatus
  source: string
  message: string
  latest: Point | null
  history: Point[]
}

const MAX_HISTORY = 600
let state: SensorState = { status: 'off', source: '', message: '', latest: null, history: [] }
const listeners = new Set<() => void>()
const emit = (patch: Partial<SensorState>) => { state = { ...state, ...patch }; listeners.forEach((listener) => listener()) }

export const getSensorState = () => state
export const useSensor = () => useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener) } }, getSensorState, getSensorState)
export const serialSupported = () => typeof navigator !== 'undefined' && 'serial' in navigator

export function pushReading(reading: Reading, at = Date.now()) {
  const point: Point = { at, ...state.latest, ...reading }
  // Carry forward channels a board did not send this time, but keep the new timestamp.
  point.at = at
  const history = [...state.history, point].slice(-MAX_HISTORY)
  emit({ latest: point, history })
}

let simTimer: ReturnType<typeof setInterval> | null = null
let port: SerialPortLike | null = null
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null

export async function stop() {
  if (simTimer) { clearInterval(simTimer); simTimer = null }
  try { await reader?.cancel() } catch { /* already closed */ }
  try { await port?.close() } catch { /* already closed */ }
  reader = null; port = null
  emit({ status: 'off', source: '', message: '' })
}

/**
 * Simulated sensors so the demo works without hardware.
 * duct: a flue-duct CO₂ monitor drifting around 800 ppm.
 */
export async function startSimulation(_mode: SimMode = 'duct') {
  await stop()
  const started = Date.now()
  emit({ status: 'simulated', source: 'Simulated duct sensor', message: 'No hardware connected: these readings are simulated.', history: [], latest: null })
  simTimer = setInterval(() => {
    const seconds = (Date.now() - started) / 1_000
    const noise = () => (Math.random() - 0.5) * 30
    pushReading({ co2: 800 + 120 * Math.sin(seconds / 20) + noise(), temp: 31 + Math.sin(seconds / 40), rh: 62 + noise() / 10 })
  }, 1_000)
}

export async function connectSerial(baudRate = 115_200) {
  if (!serialSupported()) { emit({ status: 'error', message: 'Web Serial is not available in this browser. Use Chrome or Edge on a computer.' }); return }
  await stop()
  emit({ status: 'connecting', message: 'Choose your board in the browser pop-up…' })
  try {
    port = await (navigator as unknown as { serial: SerialLike }).serial.requestPort()
    await port.open({ baudRate })
    emit({ status: 'live', source: `USB serial · ${baudRate} baud`, message: 'Live hardware connected.', history: [], latest: null })
    void readLoop()
  } catch (error) {
    emit({ status: 'error', message: error instanceof Error ? error.message : 'Could not open the serial port.' })
  }
}

async function readLoop() {
  if (!port?.readable) return
  const decoder = new TextDecoder()
  let buffer = ''
  reader = port.readable.getReader()
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const reading = parseLine(line)
        if (reading) pushReading(reading)
      }
    }
  } catch (error) {
    emit({ status: 'error', message: error instanceof Error ? `Connection lost: ${error.message}` : 'Connection lost.' })
  } finally {
    reader?.releaseLock()
  }
}

