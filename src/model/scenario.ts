/**
 * Turn a what-if sandbox scenario into plan actions. Each sandbox upgrade maps to the plan measure
 * with the same saving and cost assumptions, on the machine the upgrade belongs to.
 */
import { galvUnits, type GalvUpgrades } from './galv'
import type { Upgrades } from './steel'
import type { FactoryState, Machine } from './types'

export type ScenarioItem = { machineId: string; measureId: string; scale?: number; label: string }

const steelMachine = (state: FactoryState, unitId: string) => state.machines.find((machine) => machine.unitId === unitId)
const galvMachine = (state: FactoryState, unitId: string) => {
  const name = galvUnits.find((unit) => unit.id === unitId)?.machineName
  return state.machines.find((machine) => machine.name === name)
}

function push(items: ScenarioItem[], machine: Machine | undefined, measureId: string, label: string, scale?: number) {
  if (machine) items.push({ machineId: machine.id, measureId, label: `${label} · ${machine.name}`, ...(scale !== undefined ? { scale } : {}) })
}

/** Green electricity covers every electric machine at the chosen share, as in the simulation. */
function green(items: ScenarioItem[], machines: Machine[], share: number) {
  if (share <= 0) return
  for (const machine of machines.filter((item) => item.electricityMWh > 0)) push(items, machine, 'green-ppa', `Green electricity ${Math.round(share * 100)}%`, share)
}

export function steelScenario(state: FactoryState, u: Upgrades): ScenarioItem[] {
  const items: ScenarioItem[] = []
  if (u.meltPractice) push(items, steelMachine(state, 'melt'), 'if-practice', 'Induction melting best practice')
  if (u.igbt) push(items, steelMachine(state, 'melt'), 'igbt-supply', 'IGBT power supplies')
  if (u.fumeVsd) push(items, steelMachine(state, 'fume'), 'vsd', 'Variable-speed fume fans')
  if (u.hotCharging) push(items, steelMachine(state, 'reheat'), 'hot-charging', 'Hot charging')
  if (u.regenBurners) push(items, steelMachine(state, 'reheat'), 'regen-burners', 'Regenerative burners')
  green(items, state.machines.filter((machine) => machine.unitId), u.greenShare)
  return items
}

export function galvScenario(state: FactoryState, u: GalvUpgrades): ScenarioItem[] {
  const items: ScenarioItem[] = []
  if (u.coatingControl) push(items, galvMachine(state, 'kettle'), 'galv-coating', 'Coating-weight control')
  if (u.drawing) push(items, galvMachine(state, 'drawing'), 'galv-drawing', 'Drawing drives, dies & lubrication')
  if (u.kettleCover) push(items, galvMachine(state, 'kettle'), 'galv-kettle', 'Kettle covers & burners')
  // Induction replaces the gas furnace, so recuperators on that furnace no longer apply.
  if (u.induction) push(items, galvMachine(state, 'anneal'), 'galv-induction', 'Induction annealing')
  else if (u.recuperator) push(items, galvMachine(state, 'anneal'), 'galv-recuperator', 'Annealing recuperators')
  const plantMachines = galvUnits.map((unit) => galvMachine(state, unit.id)).filter((machine): machine is Machine => Boolean(machine))
  green(items, plantMachines, u.greenShare)
  return items
}
