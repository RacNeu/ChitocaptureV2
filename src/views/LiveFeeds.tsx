import { useEffect, useState } from 'react'
import { num } from '../format'
import Info from '../components/Info'
import { Sparkline } from '../components/MsCharts'
import { faults, FURNACES, rules } from '../live/feed'
import { clockOf, live, useLive } from '../live/store'
import { useFactory } from '../model/store'
import Sensors from './Sensors'

/** Plant → cloud → app → Telegram, drawn for the pitch. Simulated parts are marked. */
function Architecture() {
  const box = (x: number, y: number, w: number, title: string, sub: string, tone: 'plant' | 'cloud' | 'app' | 'out', sim?: boolean) =>
    <g transform={`translate(${x} ${y})`} className={`arch-box ${tone}`}>
      <rect width={w} height="74" rx="12" />
      <text x={w / 2} y="30" textAnchor="middle" className="arch-title">{title}</text>
      <text x={w / 2} y="50" textAnchor="middle" className="arch-sub">{sub}</text>
      {sim && <g transform={`translate(${w - 64} -10)`}><rect width="70" height="20" rx="10" className="arch-sim" /><text x="35" y="14" textAnchor="middle" className="arch-simtext">in demo: simulated</text></g>}
    </g>
  const arrow = (x1: number, y1: number, x2: number, y2: number, label: string) => <g className="arch-arrow">
    <path d={`M${x1} ${y1} L${x2} ${y2}`} markerEnd="url(#arch-head)" />
    <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} textAnchor="middle">{label}</text>
  </g>
  return <svg viewBox="0 0 1000 330" className="arch" role="img" aria-label="Sensors and the furnace PLC send readings through a plant gateway to an MQTT broker; the app shows them live, a database keeps history, and a 24/7 alert service sends Telegram messages.">
    <defs><marker id="arch-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" /></marker></defs>
    <text x="10" y="18" className="arch-zone">PLANT</text><text x="300" y="18" className="arch-zone">CLOUD</text><text x="760" y="18" className="arch-zone">PEOPLE</text>
    {box(10, 34, 230, 'Sensors', 'ESP32 · coil water, current, leak', 'plant', true)}
    {box(10, 128, 230, 'Furnace PLC / HMI', 'power, bath °C, set points', 'plant', true)}
    {box(10, 222, 230, 'Plant gateway', 'Node-RED / Python · OPC UA, Modbus', 'plant', true)}
    {box(300, 128, 210, 'MQTT broker', 'HiveMQ / EMQX · TLS', 'cloud')}
    {box(560, 34, 190, 'ChitoCapture app', 'live HMI · Data feeds', 'app')}
    {box(560, 128, 190, 'Database', 'Supabase · history, reports', 'cloud')}
    {box(560, 222, 190, '24/7 alert service', 'rules + anomaly checks', 'cloud')}
    {box(800, 128, 190, 'Telegram bot', 'plant group chat', 'out')}
    {arrow(125, 108, 125, 128, '')}{arrow(125, 202, 125, 222, '')}
    {arrow(240, 258, 300, 182, 'publish 1 s')}
    {arrow(510, 150, 560, 82, 'live (WebSocket)')}
    {arrow(510, 165, 560, 165, 'store')}
    {arrow(510, 180, 560, 250, 'subscribe')}
    {arrow(750, 250, 800, 182, 'sendMessage')}
  </svg>
}

export default function LiveFeeds() {
  const s = useLive()
  const state = useFactory()
  const [f, setF] = useState('IF3')
  useEffect(() => { live.setSite(state.settings.factoryName) }, [state.settings.factoryName])
  const active = s.alerts.filter((a) => a.active)
  const log = [...s.alerts].reverse().slice(0, 12)
  const status = (on: boolean | null, text: string) => <span className={`lf-pill ${on === null ? 'idle' : on ? 'on' : 'off'}`}><i />{text}</span>

  return <div className="lf ms">
    <header className="ms-head">
      <div><span className="eyebrow">Settings · Data feeds</span><h1>Live data & alerts</h1>
        <p className="muted">Sensors and the furnace PLC stream readings into the app; a 24/7 service watches them and sends alerts to the plant’s Telegram group. This demo runs on a simulated plant so you can see the whole path working.</p></div>
      <div className="row-actions">
        {s.running ? <button type="button" className="btn ghost" onClick={() => live.stop()}>❚❚ Pause live feed</button> : <button type="button" className="btn" onClick={() => live.start()}>▶ Start live feed</button>}
        <select value={s.speed} onChange={(e) => live.setSpeed(Number(e.target.value))} aria-label="Speed" className="lf-speed">{[1, 4, 12].map((v) => <option key={v} value={v}>{v === 1 ? '1 min per second' : `${v} min per second`}</option>)}</select>
      </div>
    </header>

    <div className="lf-conn">
      <div className="ms-card"><span>Simulated live feed</span>{status(s.running, s.running ? `Streaming · ${clockOf(s.t)}` : 'Paused')}<small>4 furnaces · 7 signals each · one reading per minute</small></div>
      <div className="ms-card"><span>MQTT broker</span>{status(null, 'Not connected')}<small>Real plants publish here (HiveMQ, EMQX). <Info>The app subscribes over secure WebSocket (wss://) to topics like plant/IF3/coil/flow. Add the broker URL and credentials in Settings to switch from the simulated feed.</Info></small></div>
      <div className="ms-card"><span>History database</span>{status(null, 'Not connected')}<small>Keeps readings for reports and replay.</small></div>
      <div className="ms-card"><span>Telegram</span>{status(s.telegram.mode === 'live' ? true : null, s.telegram.mode === 'live' ? 'Connected' : 'Preview only')}<small>{s.telegram.mode === 'live' ? 'Alerts go to the plant group.' : 'Add a bot token on the server to send for real.'}</small></div>
    </div>

    <div className="lf-grid">
      <section className="ms-card">
        <div className="ms-card-head"><h3>Live sensors</h3><div className="ms-chips">{FURNACES.map((x) => <button key={x} type="button" className={x === f ? 'on' : ''} onClick={() => setF(x)}>{active.some((a) => a.furnace === x) && <i className="ms-alarm-dot" />}{x}</button>)}</div></div>
        {!s.latest[f] ? <p className="ms-note">Start the live feed to see readings.</p> : <table className="ms-table lf-table">
          <thead><tr><th>Signal</th><th className="num">Now</th><th>Last hour</th><th>Status</th></tr></thead>
          <tbody>{[
            { k: 'kw', label: 'Power', unit: 'MW', v: (r: typeof s.latest[string]) => r.kw / 1_000, d: 1, warn: () => false },
            { k: 'hz', label: 'Frequency', unit: 'Hz', v: (r: typeof s.latest[string]) => r.hz, d: 0, warn: () => false },
            { k: 'bath', label: 'Bath temperature', unit: '°C', v: (r: typeof s.latest[string]) => r.bathC ?? 0, d: 0, warn: (r: typeof s.latest[string]) => (r.bathC ?? 0) > 1_650 },
            { k: 'in', label: 'Coil water in', unit: '°C', v: (r: typeof s.latest[string]) => r.waterInC, d: 1, warn: () => false },
            { k: 'out', label: 'Coil water out', unit: '°C', v: (r: typeof s.latest[string]) => r.waterOutC, d: 1, warn: (r: typeof s.latest[string]) => r.waterOutC > 55 },
            { k: 'flow', label: 'Coil water flow', unit: 'm³/h', v: (r: typeof s.latest[string]) => r.flowM3h, d: 0, warn: (r: typeof s.latest[string]) => r.flowM3h < 300 },
            { k: 'leak', label: 'Earth leakage', unit: 'mA', v: (r: typeof s.latest[string]) => r.leakMA, d: 1, warn: (r: typeof s.latest[string]) => r.leakMA > 15 },
          ].map((row) => { const r = s.latest[f]; const bad = row.warn(r); return <tr key={row.k} className={bad ? 'bad' : ''}>
            <td><b>{row.label}</b><small>{row.unit}</small></td>
            <td className="num"><b>{num(row.v(r), row.d)}</b></td>
            <td className="lf-spark"><Sparkline values={(s.history[f] ?? []).slice(-60).map(row.v)} color={bad ? '#e11d48' : '#0ea5e9'} height={28} /></td>
            <td>{status(!bad, bad ? 'Out of range' : 'Normal')}</td>
          </tr> })}</tbody>
        </table>}
        <div className="lf-faults"><b>Demo faults on {f}</b>{faults.map((x) => <button key={x.id} type="button" title={x.what} className={s.faults[x.id]?.furnace === f ? 'on' : ''} onClick={() => { if (!s.running) live.start(); live.inject(x.id, f) }}>{x.label}</button>)}<button type="button" className="clear" onClick={() => live.clearFaults()}>Clear</button></div>
      </section>

      <section className="ms-card lf-phone-card">
        <div className="ms-card-head"><h3>Telegram alerts</h3><button type="button" className="btn small ghost" onClick={() => void live.sendTest()}>Send test</button></div>
        <div className="lf-phone">
          <div className="lf-phone-top"><span className="lf-avatar">IF</span><div><b>Melt Shop Alerts</b><small>ChitoCapture bot · {FURNACES.length} furnaces</small></div></div>
          <div className="lf-chat">
            {s.telegram.messages.length === 0 && <p className="lf-empty">No alerts yet. Inject a demo fault to see one arrive.</p>}
            {s.telegram.messages.slice(-8).map((m) => <div key={m.id} className={`lf-msg ${m.level}`}>
              {m.text.split('\n').map((l, i) => i === 0 ? <b key={i}>{l}</b> : <span key={i}>{l}</span>)}
              <em>{m.clock} {m.delivered === 'sent' ? '✓✓' : m.delivered === 'failed' ? '⚠ not sent' : '· preview'}</em>
            </div>)}
          </div>
        </div>
        <p className="ms-note">{s.telegram.mode === 'live' ? 'Connected: messages are delivered to the group.' : 'Preview: this is exactly what the group would receive. To send for real, create a bot with @BotFather and set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID on the server.'}</p>
      </section>
    </div>

    <div className="lf-grid">
      <section className="ms-card">
        <div className="ms-card-head"><h3>Alerts {active.length > 0 && <span className="ms-badge b-check">{active.length} active</span>}</h3></div>
        {log.length === 0 ? <p className="ms-note">No alerts.</p> : <ul className="lf-alerts">{log.map((a) => <li key={a.id} className={`${a.level} ${a.active ? 'active' : ''}`}>
          <span className="lf-time">{clockOf(a.t)}</span>
          <div><b>{a.title}</b><small>{a.detail}</small><em>{a.action}</em></div>
          {a.active ? <button type="button" className="btn small ghost" onClick={() => live.acknowledge(a.id)}>Ack</button> : <span className="lf-cleared">cleared</span>}
        </li>)}</ul>}
      </section>
      <section className="ms-card">
        <h3>Alert rules</h3>
        <table className="ms-table"><thead><tr><th>Rule</th><th>Limit</th><th>Level</th></tr></thead>
          <tbody>{rules.map((r) => <tr key={r.key}><td><b>{r.label}</b><small>{r.source}</small></td><td>{r.limit}</td><td><span className={`ms-badge ${r.level === 'alarm' ? 'b-check' : 'b-published'}`}>{r.level}</span></td></tr>)}</tbody></table>
        <p className="ms-note">Each alert is sent once and stays open until the reading has been normal for 3 minutes, so a flapping signal doesn’t flood the chat.</p>
      </section>
    </div>

    <section className="ms-card">
      <h3>How live monitoring works</h3>
      <Architecture />
      <ol className="lf-steps">
        <li><b>Measure.</b> The furnace PLC already knows power, frequency and bath temperature; small ESP32 sensors add coil-water flow and temperatures and the lining’s earth-leakage current.</li>
        <li><b>Collect.</b> A gateway PC on the plant network reads the PLC (OPC UA or Modbus TCP) and the sensors, and publishes one message per signal per second to an MQTT broker, encrypted.</li>
        <li><b>Show and keep.</b> This app subscribes and updates the HMI live; a database keeps every reading for reports, replay and the learned energy factors.</li>
        <li><b>Alert.</b> A small service runs 24/7 in the cloud, applies the same rules you see here, and sends Telegram messages through the bot. It works even when nobody has the app open.</li>
      </ol>
      <p className="ms-note">In this demo the plant, gateway and broker are simulated in your browser; the alert rules, the anomaly check and the Telegram message format are the real ones. Details: docs/live-monitoring.md.</p>
    </section>

    <details className="ms-card lf-usb"><summary><b>USB sensor (ESP32 CO₂ board)</b> · plug a board into this computer</summary><Sensors /></details>
  </div>
}
