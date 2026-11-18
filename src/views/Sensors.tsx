import { Gauge, Sparkline } from '../components/Charts'
import { num } from '../format'
import { useFactory } from '../model/store'
import { connectSerial, serialSupported, startSimulation, stop, useSensor } from '../sensor/hub'

const REPO_FIRMWARE = 'https://github.com/RacNeu/ChitocaptureV2/tree/main/firmware/esp32_co2'

export default function Sensors() {
  const sensor = useSensor()
  const state = useFactory()
  const latest = sensor.latest
  const values = (key: 'co2' | 'co2_in' | 'co2_out') => sensor.history.map((point) => point[key]).filter((value): value is number => typeof value === 'number')
  const hasRig = latest?.co2_in !== undefined && latest?.co2_out !== undefined
  const linked = state.machines.filter((machine) => machine.sensorChannel)

  return <div className="sensors">
    <section className="card connect">
      <div>
        <h1>Sensors</h1>
        <p className="muted">Plug a CO₂ sensor board into this computer and stream it straight into the twin. No cloud and no drivers: the browser reads the USB port directly. No board? Use a simulation so the demo still runs.</p>
        <p className="note">This is the USB CO₂ demo board: readings stay in this browser tab and are not saved. Furnace sensors (coil water flow and temperatures) connect over Wi-Fi, are stored and raise 24/7 alerts: see <a href="#live">Settings → Live data &amp; alerts</a>.</p>
      </div>
      <div className="row-actions">
        <button type="button" className="btn" onClick={() => void connectSerial()} disabled={!serialSupported()}>Connect USB sensor</button>
        <button type="button" className="btn ghost" onClick={() => void startSimulation('duct')}>Simulate duct sensor</button>
        {sensor.status !== 'off' && <button type="button" className="btn ghost" onClick={() => void stop()}>Stop</button>}
      </div>
      <div className={`status-line ${sensor.status}`}><i />{sensor.status === 'off' ? 'Not connected' : `${sensor.source || sensor.status}`}{sensor.message && <span> · {sensor.message}</span>}</div>
      {!serialSupported() && <p className="note">USB connection needs Chrome or Edge on a desktop computer. Simulation works everywhere.</p>}
    </section>

    <div className="gauges">
      {(latest?.co2 !== undefined || !hasRig) && <div className="card gauge-card"><Gauge value={latest?.co2 ?? null} max={5000} label="CO₂" /><Sparkline values={values('co2').slice(-120)} /></div>}
      {hasRig && <>
        <div className="card gauge-card"><Gauge value={latest!.co2_in!} max={10000} label="Column inlet" /><Sparkline values={values('co2_in').slice(-120)} /></div>
        <div className="card gauge-card"><Gauge value={latest!.co2_out!} max={10000} label="Column outlet" /><Sparkline values={values('co2_out').slice(-120)} /></div>
      </>}
      <div className="card gauge-card env">
        <div><span>Temperature</span><b>{latest?.temp !== undefined ? `${num(latest.temp, 1)} °C` : '—'}</b></div>
        <div><span>Humidity</span><b>{latest?.rh !== undefined ? `${num(latest.rh)} %` : '—'}</b></div>
        <div><span>Linked to</span><b>{linked.length ? linked.map((machine) => machine.name).join(', ') : 'No machine'}</b></div>
        <small className="muted">Link a sensor to a machine from the machine’s panel on the twin.</small>
      </div>
    </div>

    <section className="card help">
      <h2>Build the sensor</h2>
      <ol>
        <li><b>Board:</b> ESP32 dev board + Sensirion SCD41 (or SCD30) CO₂ sensor.</li>
        <li><b>Firmware:</b> flash the sketch in <a href={REPO_FIRMWARE} target="_blank" rel="noreferrer">firmware/esp32_co2</a>. It prints one JSON line per reading at 115200 baud.</li>
        <li><b>Format:</b> any line like <code>{'{"co2": 612}'}</code>, <code>{'{"co2_in": 5100, "co2_out": 820}'}</code>, <code>CO2:612</code> or just <code>612</code> works.</li>
        <li><b>Range:</b> the SCD41 is specified up to 5,000 ppm. For flue ducts, use a high-range NDIR sensor.</li>
      </ol>
    </section>
  </div>
}
