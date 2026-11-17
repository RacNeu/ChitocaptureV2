import { useState } from 'react'
import { num, tonnes } from '../format'
import { CSV_TEMPLATE, evidenceShare, importCsv, importRows, monthLabel, sampleHistory, scopesFor, sha256Hex, type ImportResult } from '../model/history'
import { roleById } from '../model/roles'
import { actions, useFactory, useRole } from '../model/store'
import type { Evidence } from '../model/types'
import Info from '../components/Info'

const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`

async function readFile(file: File): Promise<ImportResult> {
  if (/\.(xlsx|xlsm)$/i.test(file.name)) {
    // Loaded only when someone uploads a spreadsheet.
    const { default: readXlsxFile } = await import('read-excel-file')
    const rows = await readXlsxFile(file)
    return importRows(rows.map((row) => row.map((cell) => cell instanceof Date ? `${cell.getFullYear()}-${cell.getMonth() + 1}` : cell === null ? '' : String(cell))))
  }
  if (/\.xls$/i.test(file.name)) return { records: [], warnings: [], error: 'Old .xls files are not supported. Save the sheet as .xlsx or .csv.' }
  return importCsv(await file.text())
}

export default function DataUpload({ onDone }: { onDone: () => void }) {
  const state = useFactory()
  const role = useRole()
  const [notice, setNotice] = useState<string | null>(null)
  const [attachTo, setAttachTo] = useState<string | null>(null)
  const [kind, setKind] = useState<Evidence['kind']>('electricity')
  const [ref, setRef] = useState('')
  const [result, setResult] = useState<(ImportResult & { name: string }) | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const current = state.monthly ?? []

  const take = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try { setResult({ ...await readFile(file), name: file.name }) } catch { setResult({ records: [], warnings: [], error: 'The file could not be read.', name: file.name }) }
    setBusy(false)
  }
  const preview = result?.records ?? current
  const rows = preview.map((record) => ({ record, scopes: scopesFor(record, state.settings) }))
  const lockedYears = new Set((state.locks ?? []).map((lock) => lock.year))
  const isLocked = (month: string) => lockedYears.has(Number(month.slice(0, 4)))
  const hasGreen = rows.some(({ scopes }) => scopes.greenMWh > 0)
  const use = (records: typeof current, source: string) => {
    const kept = actions.setMonthly(records, source)
    setNotice(kept.length ? `${kept.length} month(s) in signed-off years were kept unchanged: ${kept.slice(0, 6).join(', ')}${kept.length > 6 ? '…' : ''}. Management can reopen a year below.` : null)
  }
  const attach = async (file: File | undefined) => {
    if (!file || !attachTo) return
    const evidence: Evidence = { name: file.name, sizeBytes: file.size, sha256: await sha256Hex(await file.arrayBuffer()), kind, ref: ref.trim() || undefined, at: new Date().toISOString(), who: roleById(role).person }
    actions.attachEvidence(attachTo, evidence)
    setRef('')
  }
  const years = [...new Set(current.map((r) => Number(r.month.slice(0, 4))))].sort((a, b) => b - a)
  const log = (state.monthlyLog ?? []).slice(-60).reverse()
  const attachRecord = current.find((r) => r.month === attachTo)

  return <div className="data-upload">
    <header className="dash-head">
      <div>
        <h1>Monthly data</h1>
        <p className="muted">{state.settings.factoryName} · one row per month: bills + production</p>
      </div>
      <div className="dash-actions"><a className="btn ghost" href={templateHref} download="chitocapture-monthly-template.csv">⤓ Download template</a></div>
    </header>

    <section className={`card dropzone${dragging ? ' dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void take(event.dataTransfer.files[0]) }}>
      <div>
        <h2>Drop a CSV or Excel file <Info>Columns: month, electricity_kwh (or _mwh), optional green_kwh (TNB Green Electricity Tariff, RECs or green PPA, for market-based Scope 2), fuels in GJ (natural_gas_gj, fuel_oil_gj, coal_gj, biomass_gj; diesel as diesel_litres), process_t and production_t. 12+ months needed; 24+ lets the forecast learn the seasons.</Info></h2>
        <p className="muted small">Use the template for the right columns</p>
      </div>
      <label className="btn file-btn">{busy ? 'Reading…' : 'Choose file'}<input type="file" accept=".csv,.txt,.xlsx,.xlsm,.xls" onChange={(event) => { void take(event.target.files?.[0]); event.target.value = '' }} /></label>
    </section>

    {result && <section className={`card import-result${result.error ? ' failed' : ''}`}>
      <h2>{result.error ? `Could not import ${result.name}` : `${result.records.length} months found in ${result.name}`}</h2>
      {result.error && <p className="alert">{result.error}</p>}
      {result.warnings.length > 0 && <ul className="warn-list">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
      {!result.error && <div className="row-actions">
        <button type="button" className="btn" onClick={() => { const locked = Boolean(state.locks?.length); use(result.records, `Upload of ${result.name}`); setResult(null); if (!locked) onDone() }}>Use these {result.records.length} months</button>
        <button type="button" className="btn ghost" onClick={() => setResult(null)}>Cancel</button>
        {result.records.length < 12 && <span className="muted small">Fewer than 12 months: the forecast will be rough.</span>}
      </div>}
    </section>}

    {notice && <p className="alert">{notice}</p>}

    <section className="card">
      <header className="card-head">
        <div><h2>{result && !result.error ? 'Preview' : current.length ? `Your data · ${current.length} months` : 'No data uploaded yet'}</h2>
          <p className="muted small">{current.length || result ? 'Scopes use the factors in Settings' : 'Showing sample data until you upload'}</p></div>
        {!result && <div className="row-actions">
          {current.length > 0 && <button type="button" className="btn ghost small" onClick={() => { if (confirm(lockedYears.size ? 'Remove the uploaded months? Months in signed-off years are kept.' : 'Remove the uploaded months? The dashboard goes back to sample data.')) use([], 'Cleared data') }}>Clear data</button>}
          {!current.length && <button type="button" className="btn ghost small" onClick={() => use(sampleHistory(state), 'Sample months loaded')}>Load sample months to edit</button>}
        </div>}
      </header>
      {rows.length > 0 && <div className="table-wrap"><table className="grid-table">
        <thead><tr><th>Month</th><th className="num">Electricity MWh</th><th className="num">Fuel GJ</th><th className="num">Process t</th><th className="num">Production t</th>{hasGreen && <th className="num">Green MWh</th>}<th className="num">Scope 1</th><th className="num">Scope 2 location</th>{hasGreen && <th className="num">Scope 2 market</th>}<th className="num">kg CO₂e/t</th>{!result && current.length > 0 && <th>Evidence</th>}</tr></thead>
        <tbody>{rows.slice().reverse().map(({ record, scopes }) => <tr key={record.month}>
          <td>{monthLabel(record.month)}{isLocked(record.month) && <span title="Signed off: changes are blocked"> 🔒</span>}</td>
          <td className="num">{num(record.electricityMWh)}</td>
          <td className="num">{num(Object.values(record.fuelGJ).reduce((sum, value) => sum + (value ?? 0), 0))}</td>
          <td className="num">{num(record.processT)}</td>
          <td className="num">{num(record.productionT)}</td>
          {hasGreen && <td className="num">{num(scopes.greenMWh)}</td>}
          <td className="num">{tonnes(scopes.scope1T)}</td>
          <td className="num">{tonnes(scopes.scope2T)}</td>
          {hasGreen && <td className="num">{tonnes(scopes.scope2MarketT)}</td>}
          <td className="num">{scopes.intensityKg !== null ? num(scopes.intensityKg) : '—'}</td>
          {!result && current.length > 0 && <td><button type="button" className="link" onClick={() => setAttachTo(record.month)}>{record.evidence?.length ? `📎 ${record.evidence.length}` : isLocked(record.month) ? 'none' : '+ Attach'}</button></td>}
        </tr>)}</tbody>
      </table></div>}
    </section>

    {attachRecord && <section className="card">
      <header className="card-head">
        <div><h2>Evidence · {monthLabel(attachRecord.month)}</h2>
          <p className="muted small">Attach the TNB bill, fuel invoice or production log behind this month. The file stays on your computer: ChitoCapture keeps its name and SHA-256 fingerprint, so an assurance provider can check that the document you hand over is the one the figures came from.</p></div>
        <button type="button" className="btn ghost small" onClick={() => setAttachTo(null)}>Close</button>
      </header>
      {attachRecord.evidence?.length ? <div className="table-wrap"><table className="grid-table">
        <thead><tr><th>Document</th><th>Type</th><th>Reference</th><th>SHA-256</th><th>Added</th><th /></tr></thead>
        <tbody>{attachRecord.evidence.map((e) => <tr key={e.sha256}>
          <td>{e.name} <span className="muted small">({num(e.sizeBytes / 1024)} KB)</span></td><td>{e.kind}</td><td>{e.ref ?? '—'}</td>
          <td><code title={e.sha256}>{e.sha256.slice(0, 16)}…</code></td><td className="small">{new Date(e.at).toLocaleDateString('en-GB')} · {e.who}</td>
          <td>{!isLocked(attachRecord.month) && <button type="button" className="link" onClick={() => actions.removeEvidence(attachRecord.month, e.sha256)}>Remove</button>}</td>
        </tr>)}</tbody>
      </table></div> : <p className="muted small">No documents attached yet.</p>}
      {isLocked(attachRecord.month) ? <p className="muted small">🔒 {attachRecord.month.slice(0, 4)} is signed off; evidence can’t be changed.</p>
        : <div className="row-actions">
          <label className="field">Type<select value={kind} onChange={(event) => setKind(event.target.value as Evidence['kind'])}>
            <option value="electricity">Electricity bill</option><option value="fuel">Fuel invoice</option><option value="production">Production log</option><option value="green">Green electricity certificate</option><option value="other">Other</option>
          </select></label>
          <label className="field">Invoice / account no. (optional)<input value={ref} onChange={(event) => setRef(event.target.value)} placeholder="e.g. TNB 2200-1234-5678" /></label>
          <label className="btn file-btn">Choose document<input type="file" onChange={(event) => { void attach(event.target.files?.[0]); event.target.value = '' }} /></label>
        </div>}
    </section>}

    {!result && years.length > 0 && <section className="card">
      <header className="card-head"><div><h2>Reporting periods</h2>
        <p className="muted small">Sign off a year once its figures are checked. Its months are then frozen, with the factors and totals at sign-off recorded for assurance. Sustainability signs off; only Management can reopen a year, with a reason.</p></div></header>
      <div className="table-wrap"><table className="grid-table">
        <thead><tr><th>Year</th><th className="num">Months</th><th className="num">With evidence</th><th>Status</th><th /></tr></thead>
        <tbody>{years.map((year) => {
          const records = current.filter((r) => r.month.startsWith(`${year}-`))
          const lock = state.locks?.find((item) => item.year === year)
          const missing = records.filter((r) => !r.evidence?.length).length
          return <tr key={year}>
            <td>{year}</td><td className="num">{records.length}</td><td className="num">{num(evidenceShare(records) * 100)}%</td>
            <td>{lock ? `🔒 Signed off ${new Date(lock.at).toLocaleDateString('en-GB')} by ${lock.who}` : 'Open'}</td>
            <td>{lock
              ? role === 'management' && <button type="button" className="btn ghost small" onClick={() => { const reason = prompt(`Why reopen ${year}? This is recorded in the audit trail.`); if (reason?.trim()) actions.unlockYear(year, reason) }}>Reopen</button>
              : role === 'sustainability' ? <button type="button" className="btn small" onClick={() => { if (confirm(`Sign off ${year}? Its ${records.length} months will be frozen.${missing ? ` ${missing} month(s) have no evidence attached.` : ''}`)) actions.lockYear(year) }}>Sign off</button>
              : <span className="muted small">Sustainability signs off</span>}</td>
          </tr>
        })}</tbody>
      </table></div>
    </section>}

    {!result && log.length > 0 && <section className="card">
      <header className="card-head"><div><h2>Change log</h2><p className="muted small">Every changed figure, who changed it and from which file. Latest {log.length} of {state.monthlyLog?.length ?? 0}.</p></div></header>
      <div className="table-wrap"><table className="grid-table">
        <thead><tr><th>When</th><th>Who</th><th>Month</th><th>Field</th><th className="num">From</th><th className="num">To</th><th>Source</th></tr></thead>
        <tbody>{log.map((c, index) => <tr key={`${c.at}-${c.month}-${c.field}-${index}`}>
          <td className="small">{new Date(c.at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</td><td className="small">{c.who}</td><td>{c.month}</td><td>{c.field}</td>
          <td className="num">{c.field === 'Month' ? (c.from === null ? '—' : 'present') : c.from === null ? '—' : num(c.from)}</td>
          <td className="num">{c.field === 'Month' ? (c.to === null ? 'removed' : 'added') : c.to === null ? '—' : num(c.to)}</td>
          <td className="small">{c.source}</td>
        </tr>)}</tbody>
      </table></div>
    </section>}
  </div>
}
