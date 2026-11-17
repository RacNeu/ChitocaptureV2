import { useState } from 'react'
import { num, tonnes } from '../format'
import { CSV_TEMPLATE, importCsv, importRows, monthLabel, sampleHistory, scopesFor, type ImportResult } from '../model/history'
import { actions, useFactory } from '../model/store'

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

  return <div className="data-upload">
    <header className="dash-head">
      <div>
        <h1>Monthly data</h1>
        <p className="muted">{state.settings.factoryName} · one row per month from your TNB electricity bills, fuel invoices and production records. The dashboard, forecast and carbon tax use these figures.</p>
      </div>
      <div className="dash-actions"><a className="btn ghost" href={templateHref} download="chitocapture-monthly-template.csv">⤓ Download template</a></div>
    </header>

    <section className={`card dropzone${dragging ? ' dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void take(event.dataTransfer.files[0]) }}>
      <div>
        <h2>Upload a CSV or Excel file</h2>
        <p className="muted small">Drop a file here, or choose one. Columns: <code>month</code>, <code>electricity_kwh</code> (or <code>_mwh</code>), fuels in GJ (<code>natural_gas_gj</code>, <code>fuel_oil_gj</code>, <code>coal_gj</code>, <code>biomass_gj</code>; diesel as <code>diesel_litres</code> or <code>diesel_gj</code>), <code>process_t</code> (process CO₂, e.g. EAF electrodes) and <code>production_t</code>. 12 months is the minimum; 24+ lets the forecast learn the seasons.</p>
      </div>
      <label className="btn file-btn">{busy ? 'Reading…' : 'Choose file'}<input type="file" accept=".csv,.txt,.xlsx,.xlsm,.xls" onChange={(event) => { void take(event.target.files?.[0]); event.target.value = '' }} /></label>
    </section>

    {result && <section className={`card import-result${result.error ? ' failed' : ''}`}>
      <h2>{result.error ? `Could not import ${result.name}` : `${result.records.length} months found in ${result.name}`}</h2>
      {result.error && <p className="alert">{result.error}</p>}
      {result.warnings.length > 0 && <ul className="warn-list">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
      {!result.error && <div className="row-actions">
        <button type="button" className="btn" onClick={() => { actions.setMonthly(result.records); setResult(null); onDone() }}>Use these {result.records.length} months</button>
        <button type="button" className="btn ghost" onClick={() => setResult(null)}>Cancel</button>
        {result.records.length < 12 && <span className="muted small">Fewer than 12 months: the forecast will be rough.</span>}
      </div>}
    </section>}

    <section className="card">
      <header className="card-head">
        <div><h2>{result && !result.error ? 'Preview' : current.length ? `Your data · ${current.length} months` : 'No data uploaded yet'}</h2>
          <p className="muted small">{current.length || result ? 'Scopes are calculated with the grid and fuel factors in Settings.' : 'The dashboard is showing sample months until you upload your own.'}</p></div>
        {!result && <div className="row-actions">
          {current.length > 0 && <button type="button" className="btn ghost small" onClick={() => { if (confirm('Remove the uploaded months? The dashboard goes back to sample data.')) actions.setMonthly([]) }}>Clear data</button>}
          {!current.length && <button type="button" className="btn ghost small" onClick={() => actions.setMonthly(sampleHistory(state))}>Load sample months to edit</button>}
        </div>}
      </header>
      {rows.length > 0 && <div className="table-wrap"><table className="grid-table">
        <thead><tr><th>Month</th><th className="num">Electricity MWh</th><th className="num">Fuel GJ</th><th className="num">Process t</th><th className="num">Production t</th><th className="num">Scope 1</th><th className="num">Scope 2</th><th className="num">kg CO₂e/t</th></tr></thead>
        <tbody>{rows.slice().reverse().map(({ record, scopes }) => <tr key={record.month}>
          <td>{monthLabel(record.month)}</td>
          <td className="num">{num(record.electricityMWh)}</td>
          <td className="num">{num(Object.values(record.fuelGJ).reduce((sum, value) => sum + (value ?? 0), 0))}</td>
          <td className="num">{num(record.processT)}</td>
          <td className="num">{num(record.productionT)}</td>
          <td className="num">{tonnes(scopes.scope1T)}</td>
          <td className="num">{tonnes(scopes.scope2T)}</td>
          <td className="num">{scopes.intensityKg !== null ? num(scopes.intensityKg) : '—'}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </div>
}
