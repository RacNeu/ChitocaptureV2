import { useEffect, useState, type MutableRefObject } from 'react'
import { num } from '../format'
import { meltInternals, steelTargets, type MeltPhase } from '../model/steel'
import InductionFurnace3D, { type FurnaceState } from './InductionFurnace3D'
import type { SimFrame } from './SteelHall3D'

const phaseOrder: MeltPhase[] = ['Charging', 'Melting', 'Holding', 'Tapping']

/** Inside one induction furnace, synchronised with the live mill simulation. */
export default function MeltDeepDive({ frame, onClose }: { frame: MutableRefObject<SimFrame>; onClose: () => void }) {
  const [, tick] = useState(0)
  useEffect(() => { const id = setInterval(() => tick((k) => k + 1), 250); return () => clearInterval(id) }, [])
  const { live, params, upgrades, minutes } = frame.current
  const inside = meltInternals(params, upgrades, minutes)
  const state: FurnaceState = {
    power: inside.powerShare, bathC: inside.bathTempC,
    phase: live.phase === 'Tapping' ? 'tapping' : live.phase === 'Holding' ? 'holding' : live.phase === 'Melting' ? 'melting' : 'idle',
    fill: live.phase === 'Charging' ? 0.25 : inside.meltFraction, alarm: false,
  }
  const kwhPerTSoFar = live.phase === 'Charging' && live.phaseProgress < 0.5 ? null : inside.heatEnergyMWh * 1_000 / params.heatSizeT
  return <div className="deepdive">
    <div className="deepdive-canvas"><InductionFurnace3D state={state} label="Induction furnace, live heat" /></div>
    <button type="button" className="deepdive-back" onClick={onClose}>← Back to the mill</button>
    <aside className="deepdive-panel">
      <span className="eyebrow">Inside an induction furnace · Heat #{live.heatNumber}</span>
      <ol className="phase-steps">{phaseOrder.map((phase) => <li key={phase} className={phase === live.phase ? 'active' : phaseOrder.indexOf(phase) < phaseOrder.indexOf(live.phase) ? 'done' : ''}>{phase}</li>)}</ol>
      <p className="deepdive-story">{inside.story}</p>
      <dl className="deepdive-stats">
        <div><dt>Melt shop power</dt><dd>{num(live.mw.melt, 1)} MW</dd></div>
        <div><dt>Bath</dt><dd>{num(inside.bathTempC)} °C</dd></div>
        <div><dt>Melted</dt><dd>{num(inside.meltFraction * 100)}%</dd></div>
        <div><dt>Coil water ΔT</dt><dd>{num(inside.coilWaterDT, 1)} °C</dd></div>
        <div><dt>Lid</dt><dd>{inside.lidOpen ? 'Open' : 'Closed'}</dd></div>
        <div><dt>CO₂ this heat</dt><dd>{num(inside.heatCO2T, 1)} t</dd></div>
        <div className="wide"><dt>Heat so far vs target</dt><dd>{kwhPerTSoFar === null ? 'starting…' : `${num(kwhPerTSoFar)} kWh/t of ${num(params.kwhPerT.melt)} planned · target ${steelTargets.melt}`}</dd></div>
      </dl>
      <p className="muted small">Driven by the mill simulation. For set points you can change, open Melt shop → Furnace HMI.</p>
    </aside>
  </div>
}
