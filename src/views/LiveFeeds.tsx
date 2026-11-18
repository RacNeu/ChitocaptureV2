import { useEffect, useState } from 'react'
import { num } from '../format'
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
  return <svg viewBox="0 0 1000 330" className="arch" role="img" aria-label="Sensors and the furnace PLC send readings through a plant gateway to the 24/7 ingest function, which stores them in the database and sends Telegram alerts; the app shows them live through Realtime.">
    <defs><marker id="arch-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" /></marker></defs>
    <text x="10" y="18" className="arch-zone">PLANT</text><text x="300" y="18" className="arch-zone">CLOUD</text><text x="760" y="18" className="arch-zone">PEOPLE</text>
    {box(10, 34, 230, 'Sensors', 'ESP32 · coil water, current, leak', 'plant', true)}
    {box(10, 128, 230, 'Furnace PLC / HMI', 'power, bath °C, set points', 'plant', true)}
    {box(10, 222, 230, 'Plant gateway', 'reads PLC + sensors every second', 'plant', true)}
    {box(300, 128, 210, 'Ingest + alerts', 'Supabase Edge Function · 24/7', 'cloud')}
    {box(560, 34, 190, 'ChitoCapture app', 'live HMI · Live data', 'app')}
    {box(560, 128, 190, 'Database', 'Supabase Postgres · history', 'cloud')}
    {box(560, 222, 190, 'Telegram bot', 'sends the alert', 'out')}
    {box(800, 222, 190, 'Plant group chat', 'operators and managers', 'out')}
    {arrow(125, 108, 125, 128, '')}{arrow(125, 202, 125, 222, '')}
    {arrow(240, 258, 300, 182, 'HTTPS POST')}
    {arrow(510, 160, 560, 160, 'store')}
    {arrow(655, 128, 655, 108, '')}
    {arrow(510, 185, 560, 245, 'alert')}
    {arrow(750, 258, 800, 258, 'message')}
    <text x="668" y="122" className="arch-arrow-label">Realtime</text>
  </svg>
}

export default function LiveFeeds() {
  const s = useLive()
  const state = useFactory()
  const [f, setF] = useState('IF3')
  const [cfg, setCfg] = useState(s.config)
  useEffect(() => { live.setSite(state.settings.factoryName) }, [state.settings.factoryName])
  const active = s.alerts.filter((a) => a.active)
  const log = [...s.alerts].reverse().slice(0, 12)
  const status = (on: boolean | null, text: string) => <span className={`lf-pill ${on === null ? 'idle' : on ? 'on' : 'off'}`}><i />{text}</span>

  return <div className="lf ms">
    <header className="ms-head">
      <div><span className="eyebrow">Sensors · cloud · alerts</span><h1>Live data & alerts</h1>
        <p className="muted">Sensors and the furnace PLC stream readings into the app; a 24/7 service watches them and sends alerts to the plant’s Telegram group. This demo runs on a simulated plant so you can see the whole path working.</p></div>
      <div className="row-actions">
        {s.running ? <button type="button" className="btn ghost" onClick={() => live.stop()}>❚❚ Pause live feed</button> : <button type="button" className="btn" onClick={() => live.start()}>▶ Start live feed</button>}
        <select value={s.speed} onChange={(e) => live.setSpeed(Number(e.target.value))} aria-label="Speed" className="lf-speed">{[1, 4, 12].map((v) => <option key={v} value={v}>{v === 1 ? '1 min per second' : `${v} min per second`}</option>)}</select>
      </div>
    </header>

    <section className="ms-card lf-source">
      <div className="ms-card-head"><h3>Where live readings come from</h3><span className="muted small">Melt shop → Furnace HMI → Live feed shows the same source</span></div>
      <div className="lf-sources two" role="radiogroup" aria-label="Live data source">
        {([
          ['sim', 'Simulation', 'Virtual plant in this browser, with demo faults', s.running ? `Streaming · ${clockOf(s.t)}` : 'Paused'],
          ['supabase', 'Supabase cloud', 'Readings posted by devices to the 24/7 ingest function, pushed here instantly. Alerts and Telegram run on the server.', s.status.supabase],
        ] as const).map(([id, title, what, st]) => <button key={id} type="button" role="radio" aria-checked={s.source === id} className={`lf-src ${s.source === id ? 'on' : ''}`} onClick={() => void live.useSource(id)}>
          <b>{title}</b><small>{what}</small>{status(s.source === id ? (st === 'Connected' || st.startsWith('Streaming') ? true : st.startsWith('Error') ? false : null) : null, s.source === id ? st : 'Not in use')}
        </button>)}
      </div>
      <div className="lf-publish">
        <b>Test publisher</b><span className="muted small">The simulated plant plays the devices and sends its readings through the real cloud path.</span>
        <label className="sim-toggle"><input type="checkbox" checked={s.publish.supabase} onChange={(e) => live.setPublish(e.target.checked)} /><span className="sim-switch" aria-hidden="true" /><span><b>Send to Supabase ingest</b><small>{s.publish.last || 'Every 3 plant-minutes, as one batch'}</small></span></label>
      </div>
      <details className="lf-settings"><summary>Connection settings</summary>
        <div className="lf-form">
          {([
            ['supabaseUrl', 'Supabase project URL', 'text'], ['supabaseKey', 'Supabase publishable key', 'password'], ['ingestKey', 'Device ingest key', 'password'], ['site', 'Site ID', 'text'],
          ] as const).map(([k, label, type]) => <label key={k} className="field"><span>{label}</span><input type={type} value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} autoComplete="off" /></label>)}
        </div>
        <div className="row-actions"><button type="button" className="btn small" onClick={() => { live.saveConfig(cfg); if (s.source !== 'sim') void live.useSource(s.source) }}>Save and reconnect</button><span className="muted small">Saved in this browser only. Defaults come from .env.local / Vercel environment variables.</span></div>
      </details>
    </section>

    <div className="lf-conn">
      <div className="ms-card"><span>Supabase</span>{status(s.config.supabaseUrl ? (s.status.supabase === 'Connected' ? true : null) : false, s.config.supabaseUrl ? (s.source === 'supabase' ? s.status.supabase : 'Configured') : 'Not configured')}<small>{s.config.supabaseUrl ? s.config.supabaseUrl.replace('https://', '') : 'Add the project URL and key'}</small></div>
      <div className="ms-card"><span>24/7 alert service</span>{status(s.config.ingestKey ? true : null, s.config.ingestKey ? 'Ingest function live' : 'Needs ingest key')}<small>Checks every posted reading, no browser needed.</small></div>
      <div className="ms-card"><span>Telegram</span>{status(s.telegram.mode === 'live' || s.telegram.messages.some((m) => m.delivered === 'sent') ? true : null, s.telegram.mode === 'live' || s.telegram.messages.some((m) => m.delivered === 'sent') ? 'Connected' : 'Preview only')}<small>Server needs a bot token (see How it works).</small></div>
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
        <li><b>Collect.</b> A gateway PC on the plant network reads the PLC (OPC UA or Modbus TCP) and the sensors, and posts the readings over HTTPS to the ingest function every few seconds. ESP32 sensors can post directly.</li>
        <li><b>Keep and show.</b> The function stores every reading in the database (for reports, replay and the learned energy factors), and the app receives each new reading instantly.</li>
        <li><b>Alert.</b> The same function checks every reading against the rules and sends Telegram messages through the bot, 24/7, even when nobody has the app open.</li>
      </ol>
      <p className="ms-note">Built and running: the Supabase database, the 24/7 ingest + alert function (Supabase Edge Function) and the live link to this app. Simulated: the sensors, PLC and gateway (the test publisher plays them). Telegram sends once a bot token is added. Details: docs/live-monitoring.md.</p>
    </section>

    <details className="ms-card lf-usb"><summary><b>USB sensor (ESP32 CO₂ board)</b> · plug a board into this computer</summary><Sensors /></details>
  </div>
}
