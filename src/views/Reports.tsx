import { useMemo, useState } from 'react'
import { defaultTaxInputs, type TaxInputs } from '../model/carbonTax'
import { fuelFactorsKgPerGJ } from '../model/factors'
import { fuels, historyFor, monthLabel } from '../model/history'
import { outlook } from '../model/outlook'
import { EU_CARBON_PRICE_EUR, RM_PER_EUR } from '../model/prices'
import { num, ringgit, tonnes } from '../format'
import { areaSummary, contextFor, machineEmissions, performance, plannedActions, summarise } from '../model/calc'
import { fuelLabels, gridFactor } from '../model/factors'
import { measureById } from '../model/measures'
import { roleById, statusInfo } from '../model/roles'
import { sources } from '../model/sources'
import { annual, cbam, cbamPhaseIn, defaultSteelParams, intensity, noUpgrades, type Upgrades } from '../model/steel'
import { useCompany, useFactory, useRole } from '../model/store'
import { templateById } from '../model/templates'
import { MalaysiaRules } from '../components/Malaysia'
import { stateById } from '../model/malaysia'

type Kind = 'bursa' | 'site' | 'eeca' | 'cbam'
const EECA_THRESHOLD_GJ = 21_600
const today = () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })

function Cite({ ids }: { ids: string[] }) {
  return <sup className="cite">[{ids.map((id) => sources.findIndex((item) => item.id === id) + 1).join(', ')}]</sup>
}

export default function Reports() {
  const state = useFactory()
  const company = useCompany()
  const role = useRole()
  const isSteel = state.settings.industryId === 'steel'
  const [kind, setKind] = useState<Kind>('bursa')
  const [ghgPeriod, setGhgPeriod] = useState('last12')
  const tax: TaxInputs = { ...defaultTaxInputs, ...state.settings.carbonTax }
  const view = useMemo(() => outlook(state, tax), [state]) // eslint-disable-line react-hooks/exhaustive-deps
  const [period, setPeriod] = useState(String(new Date().getFullYear()))
  const [exportT, setExportT] = useState(100_000)
  const [euPrice, setEuPrice] = useState(EU_CARBON_PRICE_EUR)
  const ctx = contextFor(state)
  const summary = summarise(state)
  const production = state.settings.productionTPerYear
  const unit = state.settings.productUnit
  const preparedBy = roleById(role).person
  const usedSources = new Set<string>(['gef', 'ipcc', 'illustrative'])

  const kinds: { id: Kind; label: string; blurb: string; disabled?: boolean }[] = [
    { id: 'bursa', label: 'GHG disclosure (Bursa / NSRF)', blurb: 'Scope 1 and 2 from monthly data, intensity, methods, factors, target progress and carbon price exposure.' },
    { id: 'site', label: 'Site carbon report', blurb: 'Emissions by source and area, intensity, plan progress and verified savings.' },
    { id: 'eeca', label: 'EECA energy report', blurb: 'Energy use in GJ against the 21,600 GJ threshold, energy per tonne and improvement measures.' },
    { id: 'cbam', label: 'CBAM summary', blurb: 'Embedded emissions per tonne of steel and estimated CBAM cost.', disabled: !isSteel },
  ]

  // ---------- Report bodies ----------
  const siteReport = () => {
    const planned = plannedActions(state)
    const verified = state.plan.filter((action) => action.status === 'verified')
    const verifiedT = verified.reduce((sum, action) => sum + (action.measuredT ?? 0), 0)
    const ranked = [...summary.byMachine].sort((a, b) => b.baselineT - a.baselineT)
    const scope1 = summary.byMachine.reduce((sum, row) => { const e = machineEmissions(row.machine, ctx); return sum + e.fuelT + e.processT }, 0)
    const scope2 = summary.byMachine.reduce((sum, row) => sum + machineEmissions(row.machine, ctx).electricityT, 0)
    return <>
      <h2>1. Summary</h2>
      <table className="rep-kv"><tbody>
        <tr><td>Total emissions</td><td><b>{tonnes(summary.baselineT)} CO₂e</b> per year</td></tr>
        <tr><td>Scope 1 (fuel and process)</td><td>{tonnes(scope1)}</td></tr>
        <tr><td>Scope 2 (grid electricity, location-based)<Cite ids={['gef']} /></td><td>{tonnes(scope2)} at {num(ctx.gridKgPerKWh, 3)} kg CO₂/kWh</td></tr>
        {production && <tr><td>Intensity</td><td>{num(summary.baselineT / production * 1_000)} kg CO₂e per tonne of {unit}</td></tr>}
        <tr><td>Target {state.settings.targetYear}</td><td>{tonnes(summary.targetT)} (−{state.settings.targetReductionPct}% from {state.settings.baselineYear})</td></tr>
        <tr><td>Planned reduction</td><td>{tonnes(summary.plannedReductionT)} per year from {planned.length} active actions</td></tr>
        <tr><td>Verified reduction</td><td>{tonnes(verifiedT)} per year from {verified.length} verified actions</td></tr>
      </tbody></table>
      <h2>2. Emissions by source</h2>
      <table className="rep-table"><thead><tr><th>Source</th><th>Area</th><th className="num">t CO₂e/yr</th><th className="num">Share</th><th>Data</th></tr></thead>
        <tbody>{ranked.map((row) => <tr key={row.machine.id}><td>{row.machine.name}</td><td>{row.machine.area ?? '—'}</td><td className="num">{num(row.baselineT)}</td><td className="num">{num(row.baselineT / Math.max(1, summary.baselineT) * 100, 1)}%</td><td>{row.machine.quality}</td></tr>)}</tbody></table>
      <h2>3. By process area</h2>
      <table className="rep-table"><thead><tr><th>Area</th><th className="num">t CO₂e/yr</th>{production && <th className="num">kg/t {unit}</th>}</tr></thead>
        <tbody>{areaSummary(state).map((area) => <tr key={area.area}><td>{area.area}</td><td className="num">{num(area.totalT)}</td>{production && <td className="num">{num(area.perTonneKg ?? 0)}</td>}</tr>)}</tbody></table>
      <h2>4. Reduction actions</h2>
      {state.plan.length === 0 ? <p>No actions recorded yet.</p> : <table className="rep-table"><thead><tr><th>Action</th><th>Machine</th><th>Status</th><th>Owner</th><th className="num">Estimated t/yr</th><th className="num">Measured t/yr</th></tr></thead>
        <tbody>{state.plan.map((action) => { const p = planned.find((item) => item.action.id === action.id); return <tr key={action.id}>
          <td>{measureById(action.measureId)?.name}</td><td>{state.machines.find((machine) => machine.id === action.machineId)?.name}</td>
          <td>{statusInfo[action.status ?? 'proposed'].label}</td><td>{action.owner ?? '—'}</td>
          <td className="num">{p ? num(p.economics.netT) : '—'}</td><td className="num">{action.measuredT !== undefined ? num(action.measuredT) : '—'}</td></tr> })}</tbody></table>}
    </>
  }

  const eecaReport = () => {
    usedSources.add('eeca')
    const rows = state.machines.map((machine) => ({ machine, elecGJ: machine.electricityMWh * 3.6, fuelGJ: machine.fuelGJ, perf: performance(machine, state) }))
    const elecGJ = rows.reduce((sum, row) => sum + row.elecGJ, 0)
    const fuelGJ = rows.reduce((sum, row) => sum + row.fuelGJ, 0)
    const total = elecGJ + fuelGJ
    const fuels = [...new Set(state.machines.filter((machine) => machine.fuel !== 'none').map((machine) => fuelLabels[machine.fuel]))]
    const measures = state.plan.filter((action) => action.status !== 'rejected')
    return <>
      <h2>1. Energy consumption</h2>
      <table className="rep-kv"><tbody>
        <tr><td>Electricity</td><td>{num(elecGJ / 3.6)} MWh ({num(elecGJ)} GJ)</td></tr>
        <tr><td>Fuel{fuels.length ? ` (${fuels.join(', ')})` : ''}</td><td>{num(fuelGJ)} GJ</td></tr>
        <tr><td><b>Total energy</b></td><td><b>{num(total)} GJ per year</b></td></tr>
        <tr><td>EECA threshold<Cite ids={['eeca']} /></td><td>{num(EECA_THRESHOLD_GJ)} GJ per year: this site is <b>{total >= EECA_THRESHOLD_GJ ? 'above the threshold' : 'below the threshold'}</b>{['my-sabah', 'my-sarawak'].includes(stateById(state.settings.stateId)?.gridRegionId ?? '') && state.settings.stateId !== 'labuan' ? '. The Act covers Peninsular Malaysia and Labuan only, so it does not apply at this site.' : total >= EECA_THRESHOLD_GJ ? ' (registered energy manager, energy audit and reporting required).' : '.'}</td></tr>
        {production && <tr><td>Specific energy</td><td>{num(total / production, 2)} GJ per tonne of {unit}</td></tr>}
      </tbody></table>
      <h2>2. Energy by equipment</h2>
      <table className="rep-table"><thead><tr><th>Equipment</th><th className="num">Electricity MWh</th><th className="num">Fuel GJ</th><th className="num">Share of energy</th><th className="num">Per tonne</th><th className="num">Target</th></tr></thead>
        <tbody>{[...rows].sort((a, b) => (b.elecGJ + b.fuelGJ) - (a.elecGJ + a.fuelGJ)).map((row) => <tr key={row.machine.id}>
          <td>{row.machine.name}</td><td className="num">{num(row.machine.electricityMWh)}</td><td className="num">{num(row.fuelGJ)}</td>
          <td className="num">{num((row.elecGJ + row.fuelGJ) / Math.max(1, total) * 100, 1)}%</td>
          <td className="num">{row.perf ? `${num(row.perf.actual, row.perf.unit === 'GJ/t' ? 2 : 0)} ${row.perf.unit}` : '—'}</td>
          <td className="num">{row.perf ? `${num(row.perf.target, row.perf.unit === 'GJ/t' ? 2 : 0)}${row.perf.status === 'above' ? ' ▲' : ' ✓'}` : '—'}</td></tr>)}</tbody></table>
      <h2>3. Energy efficiency measures</h2>
      {measures.length === 0 ? <p>No measures planned yet.</p> : <table className="rep-table"><thead><tr><th>Measure</th><th>Equipment</th><th>Status</th><th>Due</th></tr></thead>
        <tbody>{measures.map((action) => <tr key={action.id}><td>{measureById(action.measureId)?.name}</td><td>{state.machines.find((machine) => machine.id === action.machineId)?.name}</td><td>{statusInfo[action.status ?? 'proposed'].label}</td><td>{action.dueDate ?? '—'}</td></tr>)}</tbody></table>}
      <p className="rep-note">Layout prepared for internal review. Official EECA submissions use the Energy Commission’s prescribed forms and a registered energy manager’s sign-off.</p>
    </>
  }

  const cbamReport = () => {
    usedSources.add('cbam'); usedSources.add('eaf-kwh'); usedSources.add('eaf-co2'); usedSources.add('cbam-default'); usedSources.add('tax')
    const DEFAULT_T = 2.31
    const params = { ...defaultSteelParams, gridKgPerKWh: gridFactor(state.settings.gridRegionId, state.settings.customGridKgPerKWh) }
    const pilot: Upgrades = { ...noUpgrades, hotCharging: true, regenBurners: true }
    const base = intensity(params, noUpgrades), withPilot = intensity(params, pilot)
    const steelT = annual(params, noUpgrades).steelT
    const years = Object.keys(cbamPhaseIn).map(Number)
    return <>
      <h2>1. Embedded emissions per tonne of steel</h2>
      <table className="rep-table"><thead><tr><th /><th className="num">Today</th><th className="num">With reheat-furnace upgrades</th></tr></thead><tbody>
        <tr><td>Direct (charged under CBAM for iron and steel)</td><td className="num">{num(base.directKgPerT / 1_000, 3)} t/t</td><td className="num">{num(withPilot.directKgPerT / 1_000, 3)} t/t</td></tr>
        <tr><td>Indirect (grid electricity, reported)<Cite ids={['gef']} /></td><td className="num">{num(base.indirectKgPerT / 1_000, 3)} t/t</td><td className="num">{num(withPilot.indirectKgPerT / 1_000, 3)} t/t</td></tr>
        <tr><td>Arc furnace electricity<Cite ids={['eaf-kwh']} /></td><td className="num" colSpan={2}>{num(base.kwh.eaf)} kWh/t (typical scrap EAF about 450)</td></tr>
        <tr><td>Annual production</td><td className="num" colSpan={2}>{num(steelT)} t</td></tr>
      </tbody></table>
      <h2>2. Estimated CBAM cost by year</h2>
      <p>Assumes {num(exportT)} t a year exported to the EU, EU carbon price €{euPrice}/t at RM {RM_PER_EUR} per €, and no carbon price paid in Malaysia.<Cite ids={['cbam', 'tax']} /></p>
      <table className="rep-table"><thead><tr><th>Year</th><th className="num">Phase-in</th><th className="num">RM per tonne (verified data)</th><th className="num">RM per year (verified)</th><th className="num">RM per year (EU default {DEFAULT_T} t/t)</th></tr></thead>
        <tbody>{years.map((year) => { const result = cbam(base, { exportTPerYear: exportT, euPriceEUR: euPrice, rmPerEUR: RM_PER_EUR, malaysiaPriceRM: 0, year }); return <tr key={year}>
          <td>{year}</td><td className="num">{num(result.phaseIn * 100, 1)}%</td><td className="num">{ringgit(result.costRMPerT)}</td><td className="num">{ringgit(result.costRMPerYear)}</td><td className="num muted-cell">{ringgit(DEFAULT_T * euPrice * RM_PER_EUR * result.phaseIn * exportT)}</td></tr> })}</tbody></table>
      <p><b>Why tracking pays:</b> with verified plant data this mill’s direct emissions are {num(base.directKgPerT / 1_000, 3)} t/t. Without them, an EU importer may have to use a default value such as {DEFAULT_T} t/t<Cite ids={['cbam-default']} />, about {num(DEFAULT_T / (base.directKgPerT / 1_000), 0)}× higher, and the cost passes back to the exporter in price negotiations.</p>
      <p className="rep-note">Simplified estimate. Real CBAM declarations use verified installation data, product-specific rules, precursor emissions and EU default values.</p>
    </>
  }

  // ---------- GHG disclosure (Bursa / NSRF) ----------
  const ghgMonths = ghgPeriod === 'last12' ? view.months.slice(-12) : view.months.filter((m) => m.month.startsWith(ghgPeriod))
  const ghgPeriodLabel = ghgMonths.length ? `${monthLabel(ghgMonths[0].month)} – ${monthLabel(ghgMonths.at(-1)!.month)}` : '—'
  function ghgCsv() {
    const { records } = historyFor(state)
    const lines = ['month,electricity_mwh,fuel_gj,process_t,production_t,scope1_tco2e,scope2_tco2e,total_tco2e,kg_co2e_per_t',
      ...records.map((r) => {
        const m = view.months.find((item) => item.month === r.month)!
        const fuel = fuels.reduce((sum, f) => sum + (r.fuelGJ[f] ?? 0), 0)
        return [r.month, r.electricityMWh.toFixed(1), fuel.toFixed(1), r.processT.toFixed(1), r.productionT.toFixed(0), m.scope1T.toFixed(1), m.scope2T.toFixed(1), m.totalT.toFixed(1), m.intensityKg?.toFixed(1) ?? ''].join(',')
      }), `# grid factor ${ctx.gridKgPerKWh} kg CO2/kWh; fuel factors IPCC 2006; ${view.sample ? 'SAMPLE DATA' : 'uploaded data'}`]
    return lines.join('\n')
  }
  const bursaReport = () => {
    ;['ghgp', 'nsrf', 'gef', 'ipcc', 'sg-tax', 'tax'].forEach((id) => usedSources.add(id))
    const { records } = historyFor(state)
    const inPeriod = records.filter((r) => ghgMonths.some((m) => m.month === r.month))
    const sum = (key: 'scope1T' | 'scope2T' | 'totalT' | 'productionT') => ghgMonths.reduce((acc, m) => acc + m[key], 0)
    const s1 = sum('scope1T'), s2 = sum('scope2T'), total = s1 + s2, made = sum('productionT')
    const mwh = inPeriod.reduce((acc, r) => acc + r.electricityMWh, 0)
    const compare = view.years.filter((y) => y.actualMonths === 12 && String(y.year) !== ghgPeriod).slice(-2)
    const t = view.target
    const firstTaxYear = Number(ghgMonths.at(-1)?.month.slice(0, 4) ?? 2026) + 1
    const processT = inPeriod.reduce((acc, r) => acc + r.processT, 0)
    return <>
      {view.sample && <p className="alert">This report uses <b>sample monthly data</b>. Upload the site’s bills and production records (Monthly data) before using it externally.</p>}
      <h2>1. Reporting boundary and approach</h2>
      <table className="rep-kv"><tbody>
        <tr><td>Reporting entity</td><td>{company.name}</td></tr>
        <tr><td>Facility</td><td>{state.settings.factoryName}{stateById(state.settings.stateId) ? `, ${stateById(state.settings.stateId)?.label}` : ''}</td></tr>
        <tr><td>Consolidation approach</td><td>Operational control</td></tr>
        <tr><td>Standard</td><td>GHG Protocol Corporate Standard<Cite ids={['ghgp']} />; layout follows Bursa Malaysia and NSRF (IFRS S2) climate metrics<Cite ids={['nsrf']} /></td></tr>
        <tr><td>Gases</td><td>CO₂, reported as tCO₂e. CH₄ and N₂O from combustion are not yet included.</td></tr>
        <tr><td>Data</td><td>{ghgMonths.length} months of {view.sample ? 'sample' : 'uploaded'} activity data: electricity bills, fuel invoices and production records</td></tr>
      </tbody></table>

      <h2>2. Greenhouse gas emissions</h2>
      <table className="rep-table"><thead><tr><th>Metric</th><th className="num">{ghgPeriodLabel}</th>{compare.map((y) => <th key={y.year} className="num">{y.year}</th>)}</tr></thead><tbody>
        <tr><td>Scope 1 · direct (tCO₂e)</td><td className="num"><b>{num(s1)}</b></td>{compare.map((y) => <td key={y.year} className="num">{num(y.scope1T)}</td>)}</tr>
        <tr><td>Scope 2 · location-based (tCO₂e)</td><td className="num"><b>{num(s2)}</b></td>{compare.map((y) => <td key={y.year} className="num">{num(y.scope2T)}</td>)}</tr>
        <tr className="strong"><td>Total Scope 1 + 2 (tCO₂e)</td><td className="num"><b>{num(total)}</b></td>{compare.map((y) => <td key={y.year} className="num">{num(y.totalT)}</td>)}</tr>
        {made > 0 && <tr><td>Intensity (kg CO₂e per tonne of {unit})</td><td className="num">{num(total / made * 1_000)}</td>{compare.map((y) => <td key={y.year} className="num">{y.productionT ? num(y.totalT / y.productionT * 1_000) : '—'}</td>)}</tr>}
        {made > 0 && <tr><td>Production (t {unit})</td><td className="num">{num(made)}</td>{compare.map((y) => <td key={y.year} className="num">{num(y.productionT)}</td>)}</tr>}
        <tr><td>Electricity purchased (MWh)</td><td className="num">{num(mwh)}</td>{compare.map((y) => <td key={y.year} className="num">{num(y.scope2T / Math.max(1e-9, ctx.gridKgPerKWh))}</td>)}</tr>
      </tbody></table>

      <h2>3. Scope 1 by source</h2>
      <table className="rep-table"><thead><tr><th>Source</th><th className="num">Activity</th><th className="num">Factor</th><th className="num">tCO₂e</th><th className="num">Share of Scope 1</th></tr></thead><tbody>
        {fuels.filter((f) => f !== 'biomass').map((f) => ({ f, gj: inPeriod.reduce((acc, r) => acc + (r.fuelGJ[f] ?? 0), 0) })).filter((row) => row.gj > 0).map(({ f, gj }) => {
          const tCO2 = gj * fuelFactorsKgPerGJ[f] / 1_000
          return <tr key={f}><td>{fuelLabels[f]} combustion<Cite ids={['ipcc']} /></td><td className="num">{num(gj)} GJ</td><td className="num">{fuelFactorsKgPerGJ[f]} kg/GJ</td><td className="num">{num(tCO2)}</td><td className="num">{num(tCO2 / Math.max(1e-9, s1) * 100, 1)}%</td></tr>
        })}
        {processT > 0 && <tr><td>Process emissions (EAF electrodes, charge and injected carbon)</td><td className="num">—</td><td className="num">site data</td><td className="num">{num(processT)}</td><td className="num">{num(processT / Math.max(1e-9, s1) * 100, 1)}%</td></tr>}
      </tbody></table>
      {inPeriod.some((r) => (r.fuelGJ.biomass ?? 0) > 0) && <p>Biogenic CO₂ from {num(inPeriod.reduce((acc, r) => acc + (r.fuelGJ.biomass ?? 0), 0))} GJ of biomass is reported separately and excluded from Scope 1.</p>}

      <h2>4. Methodology and emission factors</h2>
      <ul>
        <li>Scope 2 uses the location-based method: purchased electricity × Malaysian grid emission factor {num(ctx.gridKgPerKWh, 3)} kg CO₂/kWh<Cite ids={['gef']} />. No market-based instruments (such as TNB’s Green Electricity Tariff) are applied.</li>
        <li>Scope 1 combustion uses IPCC 2006 default CO₂ factors per GJ of fuel<Cite ids={['ipcc']} />. Diesel in litres is converted at 0.0386 GJ/L.</li>
        <li>Process emissions are entered by the site from carbon inputs (electrodes, charge and injected carbon).</li>
        <li>Monthly figures are summed over the reporting period{ghgMonths.length < 12 ? ` (${12 - ghgMonths.length} month(s) missing)` : ''}.</li>
      </ul>

      <h2>5. Target and progress</h2>
      <table className="rep-kv"><tbody>
        <tr><td>Target</td><td>−{state.settings.targetReductionPct}% {t.basis === 'intensity' ? 'emissions per tonne of product' : 'absolute Scope 1 + 2'} by {t.targetYear} from {t.baselineYear}</td></tr>
        <tr><td>Baseline ({t.baselineYear})</td><td>{tonnes(t.baselineT)}</td></tr>
        <tr><td>Forecast for {t.targetYear} (no new actions)</td><td>{t.projectedT !== null ? `${tonnes(t.projectedT)} vs target ${tonnes(t.targetT)}` : '—'}</td></tr>
        <tr><td>Status</td><td><b>{t.onTrack === null ? 'Not enough data' : t.onTrack ? 'On track' : `Off track: gap of ${tonnes(t.gapT ?? 0)} a year`}</b></td></tr>
        <tr><td>Planned actions</td><td>{plannedActions(state).length} in the decarbonisation plan, −{tonnes(summary.plannedReductionT)} a year when complete</td></tr>
      </tbody></table>

      <h2>6. Carbon price exposure</h2>
      <p>Malaysia has announced a carbon tax for the iron, steel and energy sectors without a confirmed rate<Cite ids={['tax']} />. As a scenario, Singapore’s published path is applied ({tax.rateCase} 2030 case, RM {num(tax.rmPerSGD, 2)} per S$)<Cite ids={['sg-tax']} /> to {tax.coverage === 'scope1' ? 'Scope 1' : 'Scope 1 and 2'} emissions{tax.exemptShare ? ` less a ${num(tax.exemptShare * 100)}% allowance` : ''}.</p>
      <table className="rep-table"><thead><tr><th>Year</th><th className="num">Rate (RM/t)</th><th className="num">Taxed tCO₂e</th><th className="num">Estimated cost</th></tr></thead>
        <tbody>{view.tax.filter((row) => row.year >= firstTaxYear && row.year <= 2030).map((row) => <tr key={row.year}><td>{row.year}</td><td className="num">{num(row.rmPerT)}</td><td className="num">{num(row.taxableT)}</td><td className="num">{ringgit(row.billRM)}</td></tr>)}</tbody></table>

      <h2>7. Data quality</h2>
      <ul>
        <li>{view.anomalies.length ? `${view.anomalies.length} unusual month(s) flagged for review: ${view.anomalies.slice(0, 4).map((a) => `${monthLabel(a.month)} (${a.metric.toLowerCase()} ${a.direction})`).join(', ')}.` : 'No unusual months were flagged in the energy-per-tonne checks.'}</li>
        <li>Figures have not been externally assured.</li>
      </ul>
    </>
  }

  const titles: Record<Kind, string> = { bursa: 'Greenhouse gas emissions disclosure (Scope 1 and 2)', site: 'Site carbon report', eeca: 'Energy efficiency & conservation report', cbam: 'CBAM embedded-emissions summary' }
  const body = kind === 'bursa' ? bursaReport() : kind === 'site' ? siteReport() : kind === 'eeca' ? eecaReport() : cbamReport()
  if (kind === 'site') usedSources.add('tax')

  return <div className="reports">
    <header className="plan-head no-print">
      <div><span className="eyebrow">Reports</span><h1>One-click reports</h1><p className="muted">Pick a report, check it on screen, then save it as a PDF to share or submit for review.</p></div>
      <button type="button" className="btn" onClick={() => window.print()}>⬇ Save as PDF</button>
    </header>
    <div className="report-kinds no-print">{kinds.map((item) => <button key={item.id} type="button" disabled={item.disabled} className={`report-kind${kind === item.id ? ' active' : ''}`} onClick={() => setKind(item.id)} title={item.disabled ? 'Available for steel sites' : ''}>
      <strong>{item.label}</strong><small>{item.disabled ? 'Steel sites only' : item.blurb}</small>
    </button>)}</div>
    <div className="report-options no-print">
      {kind === 'bursa'
        ? <><label className="field">Reporting period<select value={ghgPeriod} onChange={(event) => setGhgPeriod(event.target.value)}>
            <option value="last12">Last 12 months</option>
            {view.years.filter((y) => y.actualMonths === 12).reverse().map((y) => <option key={y.year} value={String(y.year)}>Calendar year {y.year}</option>)}
          </select></label>
          <a className="btn ghost" href={`data:text/csv;charset=utf-8,${encodeURIComponent(ghgCsv())}`} download={`ghg-scope1-2-${state.settings.factoryName.replace(/\W+/g, '-').toLowerCase()}.csv`}>⤓ Monthly data (CSV)</a></>
        : <label className="field">Reporting period<input value={period} onChange={(event) => setPeriod(event.target.value)} placeholder="e.g. 2026 or Oct 2026" /></label>}
      {kind === 'cbam' && <><label className="field">Exported to the EU (t/yr)<input type="number" min="0" step="10000" value={exportT} onChange={(event) => setExportT(Number(event.target.value))} /></label>
        <label className="field">EU carbon price (€/t)<input type="number" min="0" value={euPrice} onChange={(event) => setEuPrice(Number(event.target.value))} /></label></>}
    </div>

    <div className="no-print"><MalaysiaRules state={state} /></div>
    <article className="report-paper">
      <header className="rep-head">
        <div className="rep-brand"><span className="brand-mark">◭</span><div><b>ChitoCapture</b><small>Carbon tracking platform</small></div></div>
        <div className="rep-meta"><span>{company.name}</span><span>{templateById(state.settings.industryId)?.icon} {state.settings.factoryName}</span>{stateById(state.settings.stateId) && <span>{state.settings.industrialPark ? `${state.settings.industrialPark}, ` : ''}{stateById(state.settings.stateId)?.label}, Malaysia</span>}</div>
      </header>
      <h1>{titles[kind]}</h1>
      <p className="rep-sub">Reporting period: {kind === 'bursa' ? ghgPeriodLabel : period} · Generated {today()} · Prepared by {preparedBy}</p>
      {body}
      <h2>Sources</h2>
      <ol className="rep-sources">{sources.map((item, index) => usedSources.has(item.id) ? <li key={item.id} value={index + 1}>{item.source}{item.url ? ` — ${item.url}` : ''}{item.note ? ` (${item.note})` : ''}</li> : null)}</ol>
      <footer className="rep-foot">Prototype output. Sample data, prices and targets are illustrative and must be replaced with verified site data before external use.</footer>
    </article>
  </div>
}
