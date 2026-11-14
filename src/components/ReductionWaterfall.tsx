import { useState } from 'react'
import { num, ringgit, tonnes } from '../format'
import type { PlannedAction } from '../model/calc'
import { fuelFactorsKgPerGJ, fuelLabels, gridRegions } from '../model/factors'
import { measureById } from '../model/measures'
import type { FactoryState } from '../model/types'

type Bar =
  | { kind: 'start'; label: string; value: number }
  | { kind: 'cut'; label: string; value: number; item: PlannedAction }
  | { kind: 'rest'; label: string; value: number; items: PlannedAction[] }
  | { kind: 'end'; label: string; value: number }

type Props = { state: FactoryState; planned: PlannedAction[]; baselineT: number; afterT: number; targetT: number; gridKgPerKWh: number }

/** How a cut is shaded: does it pay for itself, cost little, or cost a lot per tonne? */
function costClass(item: PlannedAction) {
  const cost = item.economics.costPerTonneRM
  if (cost === null) return 'wf-none'
  if (cost <= 0) return 'wf-pays'
  return cost <= 150 ? 'wf-low' : 'wf-high'
}

const SHOWN = 7

/**
 * Today → each planned cut → result. Hover, tap or tab to a bar to see exactly how its number
 * was worked out: the machine's energy, the share saved, the emission factor, the sum and the source.
 */
export default function ReductionWaterfall({ state, planned, baselineT, afterT, targetT, gridKgPerKWh }: Props) {
  const [active, setActive] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const top = [...planned].sort((a, b) => b.economics.netT - a.economics.netT)
  const shown = top.slice(0, SHOWN), rest = top.slice(SHOWN)
  const bars: Bar[] = [
    { kind: 'start', label: 'Today', value: baselineT },
    ...shown.map((item): Bar => ({ kind: 'cut', label: measureById(item.action.measureId)?.short ?? 'Action', value: Math.max(0, item.economics.netT), item })),
    ...(rest.length ? [{ kind: 'rest', label: `${rest.length} more`, value: rest.reduce((sum, item) => sum + Math.max(0, item.economics.netT), 0), items: rest } as Bar] : []),
    { kind: 'end', label: 'With plan', value: afterT },
  ]

  const width = 760, height = 300, left = 64, right = 16, top0 = 30, bottom = 16
  const max = Math.max(baselineT, targetT) * 1.04 || 1
  const floor = Math.max(0, Math.min(afterT, targetT) - (max - Math.min(afterT, targetT)) * 0.35)
  const slot = (width - left - right) / bars.length
  const barW = slot * 0.62
  const y = (value: number) => top0 + (max - Math.max(floor, value)) / (max - floor) * (height - top0 - bottom)
  const met = afterT <= targetT

  let running = 0
  const geometry = bars.map((bar) => {
    let from: number, to: number
    if (bar.kind === 'start') { from = floor; to = bar.value; running = bar.value }
    else if (bar.kind === 'end') { from = floor; to = bar.value }
    else { from = running - bar.value; to = running; running -= bar.value }
    return { from, to, level: bar.kind === 'end' ? bar.value : running }
  })

  const shownIndex = pinned ?? active
  const open = (index: number) => setActive(index)
  const close = () => setActive(null)

  return <div className="rwf">
    <div className="rwf-legend">
      <span><i className="wf-start" />Today</span>
      <span><i className="wf-pays" />Pays for itself</span>
      <span><i className="wf-low" />Up to RM 150 per tonne</span>
      <span><i className="wf-high" />Over RM 150 per tonne</span>
      <span><i className={met ? 'wf-end-met' : 'wf-end-short'} />With plan</span>
      <span className="muted">Hover or tap a bar to see how it was calculated</span>
    </div>
    <div className="rwf-plot" onMouseLeave={close}>
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Emissions today, each planned cut, and the result against the target">
        {[0, 0.5, 1].map((f) => { const value = floor + (max - floor) * f; return <g key={f}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="chart-grid" /><text x={left - 8} y={y(value) + 4} textAnchor="end" className="chart-tick">{tonnes(value)}</text></g> })}
        {floor > 0 && <text x={left} y={12} className="chart-tick">axis starts at {tonnes(floor)} so the cuts are visible</text>}
        <line x1={left} x2={width - right} y1={y(targetT)} y2={y(targetT)} className="wf-target-line" />
        <text x={width - right} y={y(targetT) - 6} textAnchor="end" className="chart-note">Target {tonnes(targetT)}</text>
        {bars.map((bar, index) => {
          const g = geometry[index]
          const x = left + index * slot + (slot - barW) / 2
          const cls = bar.kind === 'start' ? 'wf-start' : bar.kind === 'end' ? (met ? 'wf-end-met' : 'wf-end-short') : bar.kind === 'rest' ? 'wf-rest' : costClass(bar.item)
          const next = geometry[index + 1]
          const valueText = bar.kind === 'start' || bar.kind === 'end' ? tonnes(bar.value) : `−${tonnes(bar.value)}`
          return <g key={`${bar.label}-${index}`} className={`rwf-bar ${cls}${shownIndex === index ? ' on' : ''}`} tabIndex={0} role="button"
            aria-label={`${bar.label}: ${valueText}. Show how it was calculated.`}
            onMouseEnter={() => open(index)} onFocus={() => open(index)} onBlur={close}
            onClick={() => setPinned(pinned === index ? null : index)}>
            <rect x={left + index * slot} y={top0 - 6} width={slot} height={height - top0 - bottom + 6} className="rwf-hit" />
            <rect x={x} y={y(g.to)} width={barW} height={Math.max(2, y(g.from) - y(g.to))} rx="4" className="rwf-rect" />
            <text x={x + barW / 2} y={y(g.to) - 6} textAnchor="middle" className="rwf-value">{valueText}</text>
            {next && bar.kind !== 'end' && <line x1={x + barW} x2={x + slot} y1={y(g.level)} y2={y(g.level)} className="rwf-connector" />}
          </g>
        })}
      </svg>
      <div className="rwf-labels" style={{ paddingLeft: `${left / width * 100}%`, paddingRight: `${right / width * 100}%` }}>
        {bars.map((bar, index) => <span key={index} className={shownIndex === index ? 'on' : ''}>{bar.label}</span>)}
      </div>
      {shownIndex !== null && bars[shownIndex] && <Tooltip bar={bars[shownIndex]} state={state} baselineT={baselineT} targetT={targetT} gridKgPerKWh={gridKgPerKWh}
        leftPct={(left + (shownIndex + 0.5) * slot) / width < 0.5 ? 52 : 1} pinned={pinned !== null} onClose={() => { setPinned(null); setActive(null) }} />}
    </div>
    <p className="rwf-summary">{met
      ? <>The plan cuts <b>{tonnes(baselineT - afterT)}</b> a year (−{num((baselineT - afterT) / Math.max(1, baselineT) * 100, 1)}%) and <b>meets the target</b> with {tonnes(targetT - afterT)} to spare.</>
      : <>The plan cuts <b>{tonnes(baselineT - afterT)}</b> a year (−{num((baselineT - afterT) / Math.max(1, baselineT) * 100, 1)}%). It is still <b>{tonnes(afterT - targetT)} short</b> of the target.</>}</p>
  </div>
}

function Tooltip({ bar, state, baselineT, targetT, gridKgPerKWh, leftPct, pinned, onClose }: { bar: Bar; state: FactoryState; baselineT: number; targetT: number; gridKgPerKWh: number; leftPct: number; pinned: boolean; onClose: () => void }) {
  const region = gridRegions.find((item) => item.id === state.settings.gridRegionId)
  return <div className="rwf-tip" style={{ left: `${leftPct}%` }} role="dialog" aria-label={`How ${bar.label} was calculated`}>
    {pinned && <button type="button" className="icon-btn rwf-close" onClick={onClose} aria-label="Close">✕</button>}
    {bar.kind === 'start' && <>
      <h4>Today: {tonnes(baselineT)} CO₂e a year</h4>
      <p>The sum of every machine’s emissions at this site: electricity × the grid factor, plus fuel × its fuel factor, plus process CO₂.</p>
      <dl><dt>Grid factor</dt><dd>{num(gridKgPerKWh, 3)} kg CO₂/kWh ({region?.label ?? 'custom'}, Energy Commission)</dd>
        <dt>Machines</dt><dd>{state.machines.length}, of which {state.machines.filter((m) => m.quality === 'metered').length} metered</dd></dl>
    </>}
    {bar.kind === 'end' && <>
      <h4>With the plan: {tonnes(bar.value)} a year</h4>
      <p>Today’s emissions minus every planned cut (rejected actions are left out).</p>
      <dl><dt>Target</dt><dd>{tonnes(targetT)} (−{state.settings.targetReductionPct}% by {state.settings.targetYear})</dd>
        <dt>Result</dt><dd>{bar.value <= targetT ? `Target met, ${tonnes(targetT - bar.value)} to spare` : `${tonnes(bar.value - targetT)} still to find`}</dd></dl>
    </>}
    {bar.kind === 'rest' && <>
      <h4>{bar.label}: −{tonnes(bar.value)} a year</h4>
      <ul>{bar.items.map((item) => <li key={item.action.id}>{measureById(item.action.measureId)?.name} on {item.machine.name}: −{tonnes(item.economics.netT)}</li>)}</ul>
      <p className="muted">See each one in the table below the chart.</p>
    </>}
    {bar.kind === 'cut' && <CutDetail item={bar.item} state={state} baselineT={baselineT} gridKgPerKWh={gridKgPerKWh} regionLabel={region?.label ?? 'custom'} />}
  </div>
}

function CutDetail({ item, state, baselineT, gridKgPerKWh, regionLabel }: { item: PlannedAction; state: FactoryState; baselineT: number; gridKgPerKWh: number; regionLabel: string }) {
  const measure = measureById(item.action.measureId)
  const { machine, economics: e } = item
  const effect = e.effect
  const fuelFactor = fuelFactorsKgPerGJ[machine.fuel]
  const pct = (part: number, whole: number) => whole > 0 ? `${num(part / whole * 100, 1)}%` : '—'
  const lines: string[] = []
  if (effect.electricitySavedMWh > 0) lines.push(`${num(effect.electricitySavedMWh)} MWh saved × ${num(gridKgPerKWh, 3)} t/MWh = ${tonnes(effect.electricitySavedMWh * gridKgPerKWh)}`)
  if (effect.fuelSavedGJ > 0) lines.push(`${num(effect.fuelSavedGJ)} GJ ${fuelLabels[machine.fuel].toLowerCase()} saved × ${fuelFactor} kg/GJ = ${tonnes(effect.fuelSavedGJ * fuelFactor / 1_000)}`)
  if (effect.directT > 0) lines.push(`Direct CO₂ avoided or captured: ${tonnes(effect.directT)}`)
  if (effect.addedElectricityMWh > 0) lines.push(`Minus its own electricity: ${num(effect.addedElectricityMWh)} MWh × ${num(gridKgPerKWh, 3)} = −${tonnes(e.penaltyT)}`)
  return <>
    <h4>{measure?.name}: −{tonnes(e.netT)} a year</h4>
    <p className="muted">On {machine.name}{machine.area ? ` (${machine.area})` : ''} · {pct(e.netT, baselineT)} of today’s site emissions</p>
    <dl>
      <dt>Baseline energy</dt><dd>{[machine.electricityMWh > 0 ? `${num(machine.electricityMWh)} MWh electricity` : '', machine.fuelGJ > 0 ? `${num(machine.fuelGJ)} GJ ${fuelLabels[machine.fuel].toLowerCase()}` : '', machine.processT > 0 ? `${num(machine.processT)} t process CO₂` : ''].filter(Boolean).join(' + ')} a year</dd>
      <dt>Expected reduction</dt><dd>{[effect.electricitySavedMWh > 0 ? `${pct(effect.electricitySavedMWh, machine.electricityMWh)} of its electricity` : '', effect.fuelSavedGJ > 0 ? `${pct(effect.fuelSavedGJ, machine.fuelGJ)} of its fuel` : '', effect.directT > 0 && effect.electricitySavedMWh === 0 && effect.fuelSavedGJ === 0 ? `${tonnes(effect.directT)} of direct CO₂` : ''].filter(Boolean).join(', ')}</dd>
      <dt>Operating hours</dt><dd>Already inside the yearly energy figure{state.settings.industryId === 'steel' ? ' (sample mill: 7,000 hours a year)' : ''}</dd>
      <dt>Emission factor</dt><dd>{effect.electricitySavedMWh > 0 || effect.addedElectricityMWh > 0 ? `Grid ${num(gridKgPerKWh, 3)} kg CO₂/kWh (${regionLabel}, Energy Commission)` : ''}{effect.fuelSavedGJ > 0 ? `${effect.electricitySavedMWh > 0 ? '; ' : ''}${fuelLabels[machine.fuel]} ${fuelFactor} kg CO₂/GJ (IPCC 2006)` : ''}{effect.electricitySavedMWh === 0 && effect.fuelSavedGJ === 0 && effect.addedElectricityMWh === 0 ? 'Direct CO₂, counted as measured' : ''}</dd>
      <dt>Calculation</dt><dd>{lines.map((line) => <div key={line}>{line}</div>)}</dd>
      <dt>Cost</dt><dd>{ringgit(e.capexRM)} investment · {e.annualSavingRM >= 0 ? `saves ${ringgit(e.annualSavingRM)} a year` : `costs ${ringgit(-e.annualSavingRM)} a year`}{e.paybackYears !== null ? ` · pays back in ${num(e.paybackYears, 1)} years` : ''}{e.costPerTonneRM !== null ? ` · ${e.costPerTonneRM <= 0 ? 'makes money per tonne' : `${ringgit(e.costPerTonneRM)} per tonne`}` : ''}</dd>
      <dt>Data source</dt><dd>Machine data {machine.quality === 'metered' ? 'from meters' : 'estimated (sample)'}; saving and cost are an indicative planning assumption: {measure?.basis}.</dd>
    </dl>
    {measure?.checks.length ? <p className="rwf-check">Before relying on it: {measure.checks.join('; ')}.</p> : null}
  </>
}
