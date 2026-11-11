import { useState } from 'react'
import { fuelLabels, gridRegions } from '../model/factors'
import { actions, defaultSettings, getState, machinesFromTemplate, newId, productionFor } from '../model/store'
import { industryTemplates } from '../model/templates'
import type { FuelType, Machine, MachineKind, Settings } from '../model/types'
import { kindIcon } from '../format'

const kinds: MachineKind[] = ['kiln', 'boiler', 'furnace', 'mill', 'fan', 'pump', 'compressor', 'chiller', 'production-line', 'genset', 'wastewater', 'cold-room', 'office']
const fuels = Object.keys(fuelLabels) as FuelType[]

/** Lay machines out on a 4-wide grid in the order given. */
export function autoLayout(machines: Machine[]): Machine[] {
  return machines.map((machine, index) => ({ ...machine, col: index % 4, row: Math.floor(index / 4) }))
}

/** CSV columns: name, kind, electricity_mwh, fuel, fuel_gj, process_t (header row required). */
export function parseMachinesCsv(text: string): { machines: Machine[]; errors: string[] } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const errors: string[] = []
  if (lines.length < 2) return { machines: [], errors: ['The CSV needs a header row and at least one machine.'] }
  const header = lines[0].toLowerCase().split(',').map((cell) => cell.trim())
  const col = (name: string) => header.indexOf(name)
  const machines = lines.slice(1).flatMap((line, index) => {
    const cells = line.split(',').map((cell) => cell.trim())
    const kind = (cells[col('kind')] || 'production-line') as MachineKind
    const fuel = (cells[col('fuel')] || 'none') as FuelType
    const value = (name: string) => { const raw = Number(cells[col(name)] ?? 0); return Number.isFinite(raw) && raw >= 0 ? raw : NaN }
    const row = { electricityMWh: value('electricity_mwh'), fuelGJ: value('fuel_gj'), processT: value('process_t') }
    if (!cells[col('name')]) { errors.push(`Row ${index + 2}: missing name.`); return [] }
    if (!kinds.includes(kind)) { errors.push(`Row ${index + 2}: unknown kind “${kind}”.`); return [] }
    if (!fuels.includes(fuel)) { errors.push(`Row ${index + 2}: unknown fuel “${fuel}”.`); return [] }
    if (Object.values(row).some(Number.isNaN)) { errors.push(`Row ${index + 2}: numbers must be zero or positive.`); return [] }
    return [{ id: newId('m'), name: cells[col('name')], kind, fuel, ...row, quality: 'metered' as const, col: 0, row: 0 }]
  })
  return { machines: autoLayout(machines), errors }
}

export default function Onboarding({ onDone, onCancel, progress }: { onDone: () => void; onCancel?: () => void; progress?: string }) {
  const [step, setStep] = useState(1)
  const [settings, setSettings] = useState<Settings>(() => { const current = getState().settings; const generic = current.factoryName === 'My factory' || !current.factoryName; return { ...current, factoryName: generic ? industryTemplates.find((item) => item.id === current.industryId)?.label ?? current.factoryName : current.factoryName } })
  const [machines, setMachines] = useState<Machine[]>(() => machinesFromTemplate(getState().settings.industryId))
  const [csvErrors, setCsvErrors] = useState<string[]>([])

  const pickIndustry = (industryId: string) => {
    const template = industryTemplates.find((item) => item.id === industryId)
    setSettings({ ...settings, industryId, ...productionFor(industryId), factoryName: settings.factoryName === defaultSettings.factoryName || industryTemplates.some((item) => `Sample ${item.label.toLowerCase()}` === settings.factoryName) ? `Sample ${template?.label.toLowerCase()}` : settings.factoryName })
    setMachines(machinesFromTemplate(industryId))
    setStep(2)
  }
  const edit = (id: string, patch: Partial<Machine>) => setMachines(machines.map((machine) => machine.id === id ? { ...machine, ...patch } : machine))
  const finish = () => { actions.finishOnboarding(settings, machines); onDone() }
  const quickStart = () => { const id = settings.industryId; actions.finishOnboarding({ ...defaultSettings, industryId: id, ...productionFor(id), factoryName: industryTemplates.find((item) => item.id === id)?.label ?? 'New site' }, machinesFromTemplate(id)); onDone() }

  return <div className="onboard">
    <header className="onboard-head">
      <div className="brand"><span className="brand-mark">◭</span> ChitoCapture{progress && <small>{progress}</small>}</div>
      <ol className="steps" aria-label="Setup steps">
        {['Your factory', 'Your machines', 'Your target'].map((label, index) => <li key={label} className={step === index + 1 ? 'current' : step > index + 1 ? 'done' : ''}><b>{index + 1}</b>{label}</li>)}
      </ol>
      <div className="row-actions">
        {onCancel && <button type="button" className="btn ghost small" onClick={onCancel}>Cancel</button>}
        <button type="button" className="link" onClick={quickStart}>Skip: use the sample machines →</button>
      </div>
    </header>

    {step === 1 && <section className="onboard-body">
      <h1>See your factory’s carbon, live.</h1>
      <p className="lead">In three steps you get a living map of your factory, your biggest CO₂ sources, and a costed plan to cut them that engineers and the sustainability team can both work from.</p>
      <label className="field wide">Factory name<input value={settings.factoryName} onChange={(event) => setSettings({ ...settings, factoryName: event.target.value })} /></label>
      <h2>Start with our flagship: a steel mini-mill</h2>
      {industryTemplates.filter((template) => template.id === 'steel').map((template) => <button key={template.id} type="button" className="industry hero" onClick={() => pickIndustry(template.id)}>
        <span className="industry-icon">{template.icon}</span>
        <span><strong>{template.label}</strong><small>{template.blurb} Includes a live 3D simulation of the process line, a carbon ledger per tonne of steel and CBAM exposure.</small></span>
        <span className="hero-cta">Recommended →</span>
      </button>)}
      <h2 className="sub">Also supported</h2>
      <div className="industry-grid small">
        {industryTemplates.filter((template) => template.id !== 'steel').map((template) => <button key={template.id} type="button" className={`industry${settings.industryId === template.id ? ' active' : ''}`} onClick={() => pickIndustry(template.id)}>
          <span className="industry-icon">{template.icon}</span><strong>{template.label}</strong><small>{template.blurb}</small>
        </button>)}
      </div>
      <p className="muted">The same platform works for other factories: each choice loads a sample set of machines with illustrative numbers. You can replace them with your own in the next step.</p>
    </section>}

    {step === 2 && <section className="onboard-body">
      <h1>Your machines</h1>
      <p className="lead">Enter yearly energy use for each machine from bills, meters or estimates. Mark a figure <b>metered</b> when it comes from a real meter: the copilot uses this to tell you where data is weak.</p>
      <div className="table-wrap"><table className="grid-table">
        <thead><tr><th>Machine</th><th>Type</th><th>Electricity MWh/yr</th><th>Fuel</th><th>Fuel GJ/yr</th><th>Process t CO₂e/yr</th><th>Metered?</th><th /></tr></thead>
        <tbody>{machines.map((machine) => <tr key={machine.id}>
          <td><input aria-label="Machine name" value={machine.name} onChange={(event) => edit(machine.id, { name: event.target.value })} /></td>
          <td><select aria-label="Machine type" value={machine.kind} onChange={(event) => edit(machine.id, { kind: event.target.value as MachineKind })}>{kinds.map((kind) => <option key={kind} value={kind}>{kindIcon[kind]} {kind.replace('-', ' ')}</option>)}</select></td>
          <td><input aria-label="Electricity" type="number" min="0" value={machine.electricityMWh} onChange={(event) => edit(machine.id, { electricityMWh: Number(event.target.value) })} /></td>
          <td><select aria-label="Fuel" value={machine.fuel} onChange={(event) => edit(machine.id, { fuel: event.target.value as FuelType })}>{fuels.map((fuel) => <option key={fuel} value={fuel}>{fuelLabels[fuel]}</option>)}</select></td>
          <td><input aria-label="Fuel energy" type="number" min="0" value={machine.fuelGJ} disabled={machine.fuel === 'none'} onChange={(event) => edit(machine.id, { fuelGJ: Number(event.target.value) })} /></td>
          <td><input aria-label="Process emissions" type="number" min="0" value={machine.processT} onChange={(event) => edit(machine.id, { processT: Number(event.target.value) })} /></td>
          <td><input aria-label="Metered" type="checkbox" checked={machine.quality === 'metered'} onChange={(event) => edit(machine.id, { quality: event.target.checked ? 'metered' : 'estimated' })} /></td>
          <td><button type="button" className="icon-btn" aria-label={`Remove ${machine.name}`} onClick={() => setMachines(autoLayout(machines.filter((item) => item.id !== machine.id)))}>✕</button></td>
        </tr>)}</tbody>
      </table></div>
      <div className="row-actions">
        <button type="button" className="btn ghost" onClick={() => setMachines(autoLayout([...machines, { id: newId('m'), name: 'New machine', kind: 'production-line', electricityMWh: 0, fuel: 'none', fuelGJ: 0, processT: 0, quality: 'estimated', col: 0, row: 0 }]))} disabled={machines.length >= 16}>+ Add machine</button>
        <label className="btn ghost file-btn">Import CSV<input type="file" accept=".csv,text/csv" onChange={async (event) => {
          const file = event.target.files?.[0]; if (!file) return
          const result = parseMachinesCsv(await file.text())
          setCsvErrors(result.errors)
          if (result.machines.length) setMachines(result.machines.slice(0, 16))
          event.target.value = ''
        }} /></label>
        <a className="link" href={`data:text/csv;charset=utf-8,${encodeURIComponent('name,kind,electricity_mwh,fuel,fuel_gj,process_t\nBoiler 1,boiler,120,natural-gas,40000,0\nAir compressors,compressor,900,none,0,0\n')}`} download="chitocapture-machines-template.csv">Download CSV template</a>
      </div>
      {csvErrors.length > 0 && <div className="alert" role="alert">{csvErrors.map((error) => <div key={error}>{error}</div>)}</div>}
      <nav className="onboard-nav"><button type="button" className="btn ghost" onClick={() => setStep(1)}>← Back</button><button type="button" className="btn" disabled={machines.length === 0} onClick={() => setStep(3)}>Next: set a target →</button></nav>
    </section>}

    {step === 3 && <section className="onboard-body narrow">
      <h1>Your target</h1>
      <p className="lead">Choose where your electricity comes from, so grid emissions are counted correctly, and how far you want to go.</p>
      <div className="form-grid">
        <label className="field">Electricity grid<select value={settings.gridRegionId} onChange={(event) => setSettings({ ...settings, gridRegionId: event.target.value })}>{gridRegions.map((region) => <option key={region.id} value={region.id}>{region.label}{region.id !== 'custom' ? ` · ${region.kgPerKWh} kg/kWh` : ''}</option>)}</select></label>
        {settings.gridRegionId === 'custom' && <label className="field">Grid factor (kg CO₂e/kWh)<input type="number" step="0.001" min="0" value={settings.customGridKgPerKWh} onChange={(event) => setSettings({ ...settings, customGridKgPerKWh: Number(event.target.value) })} /></label>}
        <label className="field">Reduce emissions by (%)<input type="range" min="5" max="60" step="5" value={settings.targetReductionPct} onChange={(event) => setSettings({ ...settings, targetReductionPct: Number(event.target.value) })} /><output>{settings.targetReductionPct}%</output></label>
        <label className="field">By the year<select value={settings.targetYear} onChange={(event) => setSettings({ ...settings, targetYear: Number(event.target.value) })}>{[2028, 2030, 2032, 2035].map((year) => <option key={year}>{year}</option>)}</select></label>
      </div>
      <p className="muted">{gridRegions.find((region) => region.id === settings.gridRegionId)?.note}</p>
      <nav className="onboard-nav"><button type="button" className="btn ghost" onClick={() => setStep(2)}>← Back</button><button type="button" className="btn big" onClick={finish}>Build my carbon twin →</button></nav>
    </section>}
  </div>
}
