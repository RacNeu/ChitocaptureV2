import { useEffect, useState } from 'react'
import { num } from '../format'
import { Sparkline } from '../components/MsCharts'
import { faults, FURNACES, rules } from '../live/feed'
import { clockOf, live, useLive } from '../live/store'
import { useFactory } from '../model/store'

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
    {box(560, 34, 190, 'CarbonPath app', 'live HMI · Live data', 'app')}
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


type Reading = ReturnType<typeof useLive>['latest'][string]
const signals: { k: string; label: string; unit: string; v: (r: Reading) => number; d: number; bad: (r: Reading) => boolean }[] = [
  { k: 'kw', label: 'Power', unit: 'MW', v: (r) => r.kw / 1_000, d: 1, bad: () => false },
  { k: 'hz', label: 'Frequency', unit: 'Hz', v: (r) => r.hz, d: 0, bad: () => false },
  { k: 'bath', label: 'Bath temperature', unit: '°C', v: (r) => r.bathC ?? 0, d: 0, bad: (r) => (r.bathC ?? 0) > 1_650 },
  { k: 'in', label: 'Coil water in', unit: '°C', v: (r) => r.waterInC, d: 1, bad: () => false },
  { k: 'out', label: 'Coil water out', unit: '°C', v: (r) => r.waterOutC, d: 1, bad: (r) => r.waterOutC > 55 },
  { k: 'flow', label: 'Coil water flow', unit: 'm³/h', v: (r) => r.flowM3h, d: 0, bad: (r) => r.flowM3h < 300 },
  { k: 'leak', label: 'Earth leakage', unit: 'mA', v: (r) => r.leakMA, d: 1, bad: (r) => r.leakMA > 15 },
]

export default function LiveFeeds() {
  const s = useLive()
  const state = useFactory()
  const [f, setF] = useState('IF3')
  const [cfg, setCfg] = useState(s.config)
  useEffect(() => { live.setSite(state.settings.factoryName) }, [state.settings.factoryName])
  const active = s.alerts.filter((a) => a.active)
  const log = [...s.alerts].reverse().slice(0, 20)
  const pill = (on: boolean | null, text: string, title?: string) => <span className={`lf-pill ${on === null ? 'idle' : on ? 'on' : 'off'}`} title={title}><i />{text}</span>
  const srcStatus = s.source === 'sim' ? (s.running ? `Streaming · ${clockOf(s.t)}` : 'Paused') : s.status.supabase
  const srcOk = srcStatus === 'Connected' || srcStatus.startsWith('Streaming') ? true : srcStatus.startsWith('Error') ? false : null
  const tgOn = s.telegram.mode === 'live' || s.telegram.messages.some((m) => m.delivered === 'sent')
  const r = s.latest[f]

  return <div className="lf ms">
    <header className="lf-head">
      <div><span className="eyebrow">Sensors · cloud · alerts</span><h1>Live data & alerts</h1>
        <p className="muted">Readings stream in, a 24/7 service checks them and alerts go to the plant’s Telegram group. The demo runs on a simulated plant.</p></div>
      <div className="lf-health">
        {pill(s.config.supabaseUrl ? (s.status.supabase === 'Connected' ? true : null) : false, 'Supabase', s.config.supabaseUrl ? s.config.supabaseUrl.replace('https://', '') : 'Not configured')}
        {pill(s.config.demoKey ? true : null, '24/7 alerts', s.config.demoKey ? 'Ingest function live' : 'Needs the demo ingest key')}
        {pill(tgOn ? true : null, tgOn ? 'Telegram' : 'Telegram preview', tgOn ? 'Connected' : 'Server needs a bot token')}
      </div>
    </header>

    <section className="ms-card lf-bar">
      <div className="lf-seg" role="radiogroup" aria-label="Live data source">
        {([['sim', 'Simulation'], ['supabase', 'Supabase cloud']] as const).map(([id, label]) =>
          <button key={id} type="button" role="radio" aria-checked={s.source === id} className={s.source === id ? 'on' : ''} onClick={() => void live.useSource(id)}>{label}</button>)}
      </div>
      {pill(srcOk, srcStatus)}
      <span className="lf-sep" />
      {s.running ? <button type="button" className="btn ghost small" onClick={() => live.stop()}>❚❚ Pause</button> : <button type="button" className="btn small" onClick={() => live.start()}>▶ Start feed</button>}
      <select value={s.speed} onChange={(e) => live.setSpeed(Number(e.target.value))} aria-label="Speed" className="lf-speed">{[1, 4, 12].map((v) => <option key={v} value={v}>{v} plant-min / s</option>)}</select>
      <span className="lf-sep" />
      <label className="sim-toggle lf-pub" title="The simulated plant plays the devices and sends each furnace’s latest reading through the real cloud path every 2 seconds (demo site, rate-limited)"><input type="checkbox" checked={s.publish.supabase} onChange={(e) => live.setPublish(e.target.checked)} /><span className="sim-switch" aria-hidden="true" /><span><b>Test publisher</b><small>{s.publish.last || 'Send sim readings to Supabase (demo site)'}</small></span></label>
      <details className="lf-settings"><summary>Connection</summary>
        <div className="lf-pop">
          <div className="lf-form">
            {([
              ['supabaseUrl', 'Supabase project URL', 'text'], ['supabaseKey', 'Publishable key', 'password'], ['demoKey', 'Demo ingest key', 'password'], ['site', 'Site ID', 'text'],
            ] as const).map(([k, label, type]) => <label key={k} className="field"><span>{label}</span><input type={type} value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} autoComplete="off" /></label>)}
          </div>
          <div className="row-actions"><button type="button" className="btn small" onClick={() => { live.saveConfig(cfg); if (s.source !== 'sim') void live.useSource(s.source) }}>Save and reconnect</button><span className="muted small">Saved in this browser only. Defaults come from .env.local / Vercel.</span></div>
        </div>
      </details>
    </section>

    <div className="lf-tiles" role="radiogroup" aria-label="Furnace">
      {FURNACES.map((x) => {
        const l = s.latest[x], n = active.filter((a) => a.furnace === x)
        const lvl = n.some((a) => a.level === 'alarm') ? 'alarm' : n.length ? 'warn' : 'ok'
        return <button key={x} type="button" role="radio" aria-checked={x === f} className={`lf-tile ${lvl} ${x === f ? 'on' : ''}`} onClick={() => setF(x)}>
          <div className="lf-tile-top"><b>{x}</b><span className={`lf-phase ${l?.phase ?? ''}`}>{l ? l.phase : 'no data'}</span>
            {lvl !== 'ok' && <span className={`lf-tile-alert ${lvl}`}>{n.length} {lvl}</span>}</div>
          <div className="lf-tile-kpis">
            <span><small>Power</small><b>{l ? num(l.kw / 1_000, 1) : '–'}</b><em>MW</em></span>
            <span><small>Bath</small><b>{l?.bathC != null ? num(l.bathC, 0) : '–'}</b><em>°C</em></span>
            <span className={l && l.flowM3h < 300 ? 'bad' : ''}><small>Coil flow</small><b>{l ? num(l.flowM3h, 0) : '–'}</b><em>m³/h</em></span>
            <span className={l && l.leakMA > 15 ? 'bad' : ''}><small>Leakage</small><b>{l ? num(l.leakMA, 1) : '–'}</b><em>mA</em></span>
          </div>
          <div className="lf-tile-spark"><Sparkline values={(s.history[x] ?? []).slice(-60).map((h) => h.kw / 1_000)} color={lvl === 'alarm' ? '#e11d48' : '#10b981'} height={26} /></div>
        </button>
      })}
    </div>

    <div className="lf-main">
      <section className="ms-card lf-sensors">
        <div className="ms-card-head"><h3>{f} sensors</h3>{r && <span className="muted small">Heat {r.heatNo} · {r.phase} · {clockOf(r.t)}</span>}</div>
        {!r ? <div className="lf-start"><p>Start the feed to see live readings.</p><button type="button" className="btn small" onClick={() => live.start()}>▶ Start feed</button></div> : <table className="ms-table lf-table">
          <thead><tr><th>Signal</th><th className="num">Now</th><th>Last hour</th><th>Status</th></tr></thead>
          <tbody>{signals.map((row) => { const bad = row.bad(r); return <tr key={row.k} className={bad ? 'bad' : ''}>
            <td><b>{row.label}</b><small>{row.unit}</small></td>
            <td className="num"><b>{num(row.v(r), row.d)}</b></td>
            <td className="lf-spark"><Sparkline values={(s.history[f] ?? []).slice(-60).map(row.v)} color={bad ? '#e11d48' : '#0ea5e9'} height={26} /></td>
            <td>{pill(!bad, bad ? 'Out of range' : 'Normal')}</td>
          </tr> })}</tbody>
        </table>}
        <div className="lf-faults"><b>Demo faults on {f}</b>{faults.map((x) => <button key={x.id} type="button" title={x.what} className={s.faults[x.id]?.furnace === f ? 'on' : ''} onClick={() => { if (!s.running) live.start(); live.inject(x.id, f) }}>{x.label}</button>)}<button type="button" className="clear" onClick={() => live.clearFaults()}>Clear</button></div>
      </section>

      <section className="ms-card lf-log">
        <div className="ms-card-head"><h3>Alerts {active.length > 0 && <span className="ms-badge b-check">{active.length} active</span>}</h3><span className="muted small">sent once · clears after 3 normal minutes</span></div>
        {log.length === 0 ? <p className="lf-empty-log">No alerts yet. Inject a demo fault to raise one.</p> : <ul className="lf-alerts">{log.map((a) => <li key={a.id} className={`${a.level} ${a.active ? 'active' : ''}`}>
          <span className="lf-time">{clockOf(a.t)}</span>
          <div><b>{a.title}</b><small>{a.detail}</small><em>{a.action}</em></div>
          {a.active ? <button type="button" className="btn small ghost" onClick={() => live.acknowledge(a.id)}>Ack</button> : <span className="lf-cleared">cleared</span>}
        </li>)}</ul>}
        <details className="lf-rules"><summary>Alert rules ({rules.length})</summary>
          <table className="ms-table"><thead><tr><th>Rule</th><th>Limit</th><th>Level</th></tr></thead>
            <tbody>{rules.map((x) => <tr key={x.key}><td><b>{x.label}</b><small>{x.source}</small></td><td>{x.limit}</td><td><span className={`ms-badge ${x.level === 'alarm' ? 'b-check' : 'b-published'}`}>{x.level}</span></td></tr>)}</tbody></table>
        </details>
      </section>

      <section className="ms-card lf-phone-card">
        <div className="ms-card-head"><h3>Telegram</h3><button type="button" className="btn small ghost" onClick={() => void live.sendTest()}>Send test</button></div>
        <div className="lf-phone">
          <div className="lf-phone-top"><span className="lf-avatar">IF</span><div><b>Melt Shop Alerts</b><small>CarbonPath bot · {FURNACES.length} furnaces</small></div></div>
          <div className="lf-chat">
            {s.telegram.messages.length === 0 && <p className="lf-empty">No alerts yet. Inject a demo fault to see one arrive.</p>}
            {s.telegram.messages.slice(-12).map((m) => <div key={m.id} className={`lf-msg ${m.level}`}>
              {m.text.split('\n').map((l, i) => i === 0 ? <b key={i}>{l}</b> : <span key={i}>{l}</span>)}
              <em>{m.clock} {m.delivered === 'sent' ? '✓✓' : m.delivered === 'failed' ? '⚠ not sent' : '· preview'}</em>
            </div>)}
          </div>
        </div>
        <p className="ms-note">{tgOn ? 'Connected: messages go to the group.' : 'Preview of what the group receives. To send for real, set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID on the server.'}</p>
      </section>
    </div>

    <details className="ms-card lf-how">
      <summary><h3>How live monitoring works</h3><span className="muted small">Plant → cloud → app → Telegram</span></summary>
      <div className="lf-how-body">
        <Architecture />
        <ol className="lf-steps">
          <li><b>Measure.</b> The furnace PLC knows power, frequency and bath temperature; small ESP32 sensors add coil-water flow and temperatures and the lining’s earth-leakage current.</li>
          <li><b>Collect.</b> A gateway PC reads the PLC (OPC UA or Modbus TCP) and posts readings over HTTPS to the ingest function every few seconds. ESP32 sensors can post directly.</li>
          <li><b>Keep and show.</b> The function stores every reading (reports, replay, learned energy factors) and the app receives each one instantly.</li>
          <li><b>Alert.</b> The same function checks every reading against the rules and sends Telegram messages 24/7, even when nobody has the app open.</li>
        </ol>
      </div>
      <p className="ms-note">Running: Supabase database, the 24/7 ingest + alert function and the live link to this app. Simulated: sensors, PLC and gateway (the test publisher plays them). Telegram sends once a bot token is added. Details: docs/live-monitoring.md.</p>
    </details>
  </div>
}
