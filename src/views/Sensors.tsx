import { useState } from 'react'
import { Gauge, Sparkline } from '../components/Charts'
import { num } from '../format'
import { DEFAULT_SORBENT_CAPACITY } from '../model/measures'
import { actions, useFactory } from '../model/store'
import { connectSerial, serialSupported, startRigRun, startSimulation, stop, stopRigRun, useSensor } from '../sensor/hub'
import { analyseRig } from '../sensor/rig'

const REPO_FIRMWARE = 'https://github.com/RacNeu/ChitocaptureV2/tree/main/firmware/esp32_co2'

function BreakthroughChart({ samples }: { samples: { at: number; co2_in: number; co2_out: number }[] }) {
  if (samples.length < 2) return <div className="chart-empty">Start a run to draw the breakthrough curve.</div>
  const width = 640, height = 220, left = 50, right = 12, top = 12, bottom = 28
  const t0 = samples[0].at, t1 = samples.at(-1)!.at
  const max = Math.max(...samples.map((sample) => Math.max(sample.co2_in, sample.co2_out))) * 1.08
  const x = (at: number) => left + (at - t0) / Math.max(1, t1 - t0) * (width - left - right)
  const y = (value: number) => top + (1 - value / max) * (height - top - bottom)
  const line = (key: 'co2_in' | 'co2_out') => samples.map((sample) => `${x(sample.at)},${y(sample[key])}`).join(' ')
  return <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Inlet and outlet CO₂ over the run">
    {[0, 0.5, 1].map((f) => <g key={f}><line x1={left} x2={width - right} y1={y(max * f)} y2={y(max * f)} className="chart-grid" /><text x={left - 6} y={y(max * f) + 4} textAnchor="end" className="chart-tick">{num(max * f)}</text></g>)}
    <polygon points={`${line('co2_out')} ${samples.slice().reverse().map((sample) => `${x(sample.at)},${y(sample.co2_in)}`).join(' ')}`} className="bt-area" />
    <polyline points={line('co2_in')} className="chart-line s-in" />
    <polyline points={line('co2_out')} className="chart-line s-out" />
    <text x={width - right} y={height - 8} textAnchor="end" className="chart-tick">{num((t1 - t0) / 1000)} s</text>
  </svg>
}

export default function Sensors() {
  const sensor = useSensor()
  const state = useFactory()
  const [flow, setFlow] = useState(1)
  const [mass, setMass] = useState(0.25)
  const latest = sensor.latest
  const values = (key: 'co2' | 'co2_in' | 'co2_out') => sensor.history.map((point) => point[key]).filter((value): value is number => typeof value === 'number')
  const rig = analyseRig(sensor.rigSamples, flow, mass)
  const hasRig = latest?.co2_in !== undefined && latest?.co2_out !== undefined
  const linked = state.machines.filter((machine) => machine.sensorChannel)

  return <div className="sensors">
    <section className="card connect">
      <div>
        <h1>Sensors</h1>
        <p className="muted">Plug a CO₂ sensor board into this computer and stream it straight into the twin. No cloud and no drivers: the browser reads the USB port directly. No board? Use a simulation so the demo still runs.</p>
      </div>
      <div className="row-actions">
        <button type="button" className="btn" onClick={() => void connectSerial()} disabled={!serialSupported()}>🔌 Connect USB sensor</button>
        <button type="button" className="btn ghost" onClick={() => void startSimulation('duct')}>Simulate duct sensor</button>
        <button type="button" className="btn ghost" onClick={() => void startSimulation('rig')}>Simulate capture rig</button>
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

    <section className="card rig">
      <header><div><h2>🧪 ChitoCapture pilot rig</h2><p className="muted">ChitoCapture’s own benchtop column, used to measure the chitosan sorbent before and during the pilot at the steel mill. CO₂ sensors before and after the column give the capture curve; the measured capacity then replaces the assumed value in every capture estimate in the app.</p></div></header>
      <div className="rig-grid">
        <div className="rig-controls">
          <label className="field">Gas flow (standard L/min)<input type="number" min="0" step="0.05" value={flow} onChange={(event) => setFlow(Number(event.target.value))} /></label>
          <label className="field">Sorbent mass in column (g)<input type="number" min="0" step="0.01" value={mass} onChange={(event) => setMass(Number(event.target.value))} /></label>
          <div className="row-actions">
            {!sensor.rigRecording
              ? <button type="button" className="btn" disabled={!hasRig} onClick={startRigRun}>● Start run</button>
              : <button type="button" className="btn warn" onClick={stopRigRun}>■ Stop run</button>}
          </div>
          {!hasRig && <p className="note">Needs inlet and outlet readings: connect a two-sensor board or choose <b>Simulate capture rig</b>.</p>}
          <dl className="rig-results">
            <div><dt>CO₂ captured</dt><dd>{num(rig.capturedMmol, 2)} mmol</dd></div>
            <div><dt>Capacity</dt><dd>{num(rig.capacityMmolPerG, 2)} mmol/g</dd></div>
            <div><dt>Capture efficiency (run)</dt><dd>{num(rig.captureEfficiencyPct, 1)} %</dd></div>
            <div><dt>Breakthrough now</dt><dd>{num(rig.breakthrough * 100)} %</dd></div>
          </dl>
          <button type="button" className="btn" disabled={sensor.rigRecording || rig.capacityMmolPerG < 0.05} onClick={() => actions.setMeasuredSorbentCapacity(Number(rig.capacityMmolPerG.toFixed(3)))}>Use {num(rig.capacityMmolPerG, 2)} mmol/g in the app</button>
          <p className="muted small">In use: {state.measuredSorbentCapacity !== null ? <><b>{num(state.measuredSorbentCapacity, 2)} mmol/g (measured)</b> · <button type="button" className="link" onClick={() => actions.setMeasuredSorbentCapacity(null)}>reset</button></> : `${DEFAULT_SORBENT_CAPACITY} mmol/g (assumed default)`}</p>
          {sensor.status === 'simulated' && <p className="note">Simulated runs show how the lab works. Only a capacity measured with real hardware should be presented as a result.</p>}
        </div>
        <div><BreakthroughChart samples={sensor.rigSamples} /><div className="legend"><span><i className="s-in" />Inlet</span><span><i className="s-out" />Outlet</span><span><i className="bt-swatch" />CO₂ held by the sorbent</span></div></div>
      </div>
    </section>

    <section className="card help">
      <h2>Build the sensor</h2>
      <ol>
        <li><b>Board:</b> ESP32 dev board + Sensirion SCD41 (or SCD30) CO₂ sensor. For the capture rig, use two sensors, one on each side of the column, on separate I²C buses.</li>
        <li><b>Firmware:</b> flash the sketch in <a href={REPO_FIRMWARE} target="_blank" rel="noreferrer">firmware/esp32_co2</a>. It prints one JSON line per reading at 115200 baud.</li>
        <li><b>Format:</b> any line like <code>{'{"co2": 612}'}</code>, <code>{'{"co2_in": 5100, "co2_out": 820}'}</code>, <code>CO2:612</code> or just <code>612</code> works.</li>
        <li><b>Range:</b> the SCD41 is specified up to 5,000 ppm. Keep the rig gas mix within your sensor’s range, or use a high-range NDIR sensor.</li>
        <li><b>Safety:</b> vent the outlet, keep CO₂ cylinders small and supervised, and handle amine chemicals with gloves and goggles.</li>
      </ol>
    </section>
  </div>
}
