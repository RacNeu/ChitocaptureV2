import { fuelLabels, gridRegions } from '../model/factors'
import { actions, companyActions, useCompany, useFactory } from '../model/store'
import type { FuelType, MachineKind } from '../model/types'
import { kindIcon } from '../format'

const kinds: MachineKind[] = ['kiln', 'boiler', 'furnace', 'mill', 'fan', 'pump', 'compressor', 'chiller', 'production-line', 'genset', 'wastewater', 'cold-room', 'office']
const fuels = Object.keys(fuelLabels) as FuelType[]

export default function Settings({ onRestart, onRemoved }: { onRestart: () => void; onRemoved: () => void }) {
  const state = useFactory()
  const company = useCompany()
  const { settings } = state
  const set = actions.updateSettings
  const region = gridRegions.find((item) => item.id === settings.gridRegionId)

  return <div className="settings">
    <section className="card">
      <h1>Settings</h1>
      <div className="form-grid">
        <label className="field">Company name<input value={company.name} onChange={(event) => companyActions.rename(event.target.value)} /></label>
        <label className="field">Site name<input value={settings.factoryName} onChange={(event) => set({ factoryName: event.target.value })} /></label>
        <label className="field">Electricity grid<select value={settings.gridRegionId} onChange={(event) => set({ gridRegionId: event.target.value })}>{gridRegions.map((item) => <option key={item.id} value={item.id}>{item.label}{item.id !== 'custom' ? ` · ${item.kgPerKWh} kg/kWh` : ''}</option>)}</select></label>
        {settings.gridRegionId === 'custom' && <label className="field">Grid factor (kg CO₂e/kWh)<input type="number" step="0.001" min="0" value={settings.customGridKgPerKWh} onChange={(event) => set({ customGridKgPerKWh: Number(event.target.value) })} /></label>}
        <label className="field">Electricity price (RM/MWh)<input type="number" min="0" value={settings.electricityPriceRMPerMWh} onChange={(event) => set({ electricityPriceRMPerMWh: Number(event.target.value) })} /></label>
        {(Object.keys(settings.fuelPriceRMPerGJ) as (keyof typeof settings.fuelPriceRMPerGJ)[]).map((fuel) => <label key={fuel} className="field">{fuelLabels[fuel]} price (RM/GJ)<input type="number" min="0" value={settings.fuelPriceRMPerGJ[fuel]} onChange={(event) => set({ fuelPriceRMPerGJ: { ...settings.fuelPriceRMPerGJ, [fuel]: Number(event.target.value) } })} /></label>)}
        <label className="field">Discount rate (%)<input type="number" min="0" max="30" value={settings.discountRatePct} onChange={(event) => set({ discountRatePct: Number(event.target.value) })} /></label>
        <label className="field">Baseline year<input type="number" value={settings.baselineYear} onChange={(event) => set({ baselineYear: Number(event.target.value) })} /></label>
        <label className="field">Target year<input type="number" value={settings.targetYear} onChange={(event) => set({ targetYear: Math.max(settings.baselineYear + 1, Number(event.target.value)) })} /></label>
        <label className="field">Annual production (t)<input type="number" min="0" step="1000" value={settings.productionTPerYear ?? ''} placeholder="e.g. 840000" onChange={(event) => set({ productionTPerYear: event.target.value ? Number(event.target.value) : null })} /></label>
        <label className="field">Product (what one tonne is)<input value={settings.productUnit} onChange={(event) => set({ productUnit: event.target.value })} /></label>
        <label className="field">Target reduction (%)<input type="number" min="0" max="100" value={settings.targetReductionPct} onChange={(event) => set({ targetReductionPct: Number(event.target.value) })} /></label>
      </div>
      <p className="note">{region?.note} Fuel factors use common IPCC 2006 default CO₂ values (coal 94.6, natural gas 56.1, diesel 74.1, fuel oil 77.4 kg/GJ). Biomass CO₂ is biogenic and reported separately. Prices are demo placeholders.</p>
    </section>

    <section className="card">
      <h2>Machines</h2>
      <div className="table-wrap"><table className="grid-table">
        <thead><tr><th>Machine</th><th>Area</th><th>Type</th><th>Electricity MWh/yr</th><th>Fuel</th><th>Fuel GJ/yr</th><th>Process t/yr</th><th>Target per t</th><th>Metered?</th></tr></thead>
        <tbody>{state.machines.map((machine) => <tr key={machine.id}>
          <td><input aria-label="Machine name" value={machine.name} onChange={(event) => actions.updateMachine({ ...machine, name: event.target.value })} /></td>
          <td><input aria-label="Area" value={machine.area ?? ''} placeholder="e.g. Melt shop" onChange={(event) => actions.updateMachine({ ...machine, area: event.target.value || undefined })} /></td>
          <td><select aria-label="Type" value={machine.kind} onChange={(event) => actions.updateMachine({ ...machine, kind: event.target.value as MachineKind })}>{kinds.map((kind) => <option key={kind} value={kind}>{kindIcon[kind]} {kind.replace('-', ' ')}</option>)}</select></td>
          <td><input aria-label="Electricity" type="number" min="0" value={machine.electricityMWh} onChange={(event) => actions.updateMachine({ ...machine, electricityMWh: Number(event.target.value) })} /></td>
          <td><select aria-label="Fuel" value={machine.fuel} onChange={(event) => actions.updateMachine({ ...machine, fuel: event.target.value as FuelType })}>{fuels.map((fuel) => <option key={fuel} value={fuel}>{fuelLabels[fuel]}</option>)}</select></td>
          <td><input aria-label="Fuel" type="number" min="0" value={machine.fuelGJ} onChange={(event) => actions.updateMachine({ ...machine, fuelGJ: Number(event.target.value) })} /></td>
          <td><input aria-label="Process" type="number" min="0" value={machine.processT} onChange={(event) => actions.updateMachine({ ...machine, processT: Number(event.target.value) })} /></td>
          <td><input aria-label="Energy target per tonne" type="number" min="0" step="any" value={machine.targetPerT ?? ''} placeholder={machine.fuelGJ > 0 ? 'GJ/t' : 'kWh/t'} title={machine.fuelGJ > 0 ? 'GJ of fuel per tonne' : 'kWh of electricity per tonne'} onChange={(event) => actions.updateMachine({ ...machine, targetPerT: event.target.value ? Number(event.target.value) : undefined })} /></td>
          <td><input aria-label="Metered" type="checkbox" checked={machine.quality === 'metered'} onChange={(event) => actions.updateMachine({ ...machine, quality: event.target.checked ? 'metered' : 'estimated' })} /></td>
        </tr>)}</tbody>
      </table></div>
    </section>

    <section className="card danger">
      <h2>Site & company</h2>
      <p className="muted">Restart this site’s setup with different machines, remove this site from the company, or reset the whole company to the sample.</p>
      <div className="row-actions">
        <button type="button" className="btn ghost" onClick={() => { if (confirm('Restart this site’s setup? Its machines and plan will be cleared.')) { actions.restart(); onRestart() } }}>Restart this site’s setup</button>
        {company.sites.length > 1 && <button type="button" className="btn ghost" onClick={() => { if (confirm(`Remove “${state.settings.factoryName}” from ${company.name}?`)) { companyActions.removeSite(company.activeId); onRemoved() } }}>Remove this site</button>}
        <button type="button" className="btn ghost" onClick={() => { if (confirm('Reset the whole company to the sample (steel mill, head office & R&D lab, cement plant)? All your edits will be lost.')) { companyActions.resetToSample(); onRemoved() } }}>Reset company to sample</button>
      </div>
    </section>
  </div>
}
