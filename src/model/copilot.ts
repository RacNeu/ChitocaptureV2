import { contextFor, optionsFor, summarise, type Option } from './calc'
import { measureById } from './measures'
import type { FactoryState, PlanAction } from './types'

/**
 * A rule-based copilot. It needs no AI service or API key: every answer is built from the
 * factory data and the measure library, so it always matches the numbers on screen.
 */

export type CopilotQuestion = 'start' | 'target' | 'capture' | 'data' | 'money'

export const copilotQuestions: { id: CopilotQuestion; label: string }[] = [
  { id: 'start', label: 'Where should I start?' },
  { id: 'target', label: 'How do I hit my target?' },
  { id: 'money', label: 'What saves the most money?' },
  { id: 'capture', label: 'Is carbon capture worth it?' },
  { id: 'data', label: 'How reliable is my data?' },
]

export type CopilotAnswer = { title: string; lines: string[]; suggestedPlan?: PlanAction[] }

const t = (value: number) => `${Math.round(value).toLocaleString('en-MY')} t`
const rm = (value: number) => `RM ${Math.round(value).toLocaleString('en-MY')}`

export function allOptions(state: FactoryState): Option[] {
  const planned = new Set(state.plan.map((item) => `${item.machineId}:${item.measureId}`))
  return state.machines.flatMap((machine) => optionsFor(machine, state)).filter((option) => !planned.has(`${option.machine.id}:${option.measureId}`))
}

/** Greedy cheapest-per-tonne selection until the target is met. One measure per category per machine. */
export function autoPlan(state: FactoryState): PlanAction[] {
  const summary = summarise({ ...state, plan: [] })
  const needed = summary.baselineT - summary.targetT
  const options = state.machines.flatMap((machine) => optionsFor(machine, state))
    .filter((option) => option.economics.netT > 0 && option.economics.costPerTonneRM !== null)
    .sort((a, b) => a.economics.costPerTonneRM! - b.economics.costPerTonneRM!)
  const chosen: PlanAction[] = []
  const usedCategory = new Set<string>()
  let total = 0
  for (const option of options) {
    if (total >= needed) break
    const category = measureById(option.measureId)?.category
    const key = `${option.machine.id}:${category}`
    if (usedCategory.has(key)) continue
    usedCategory.add(key)
    chosen.push({ id: `auto-${chosen.length}`, machineId: option.machine.id, measureId: option.measureId, startYear: state.settings.baselineYear + 1 })
    total += option.economics.netT
  }
  // Quick paybacks start first; the rest are spread evenly up to the target year.
  const span = Math.max(1, state.settings.targetYear - state.settings.baselineYear)
  const payback = (action: PlanAction) => options.find((option) => option.machine.id === action.machineId && option.measureId === action.measureId)?.economics.paybackYears ?? 99
  return chosen
    .sort((a, b) => payback(a) - payback(b))
    .map((action, index) => ({ ...action, startYear: state.settings.baselineYear + 1 + Math.floor(index * span / Math.max(1, chosen.length)) }))
}

export function answer(question: CopilotQuestion, state: FactoryState): CopilotAnswer {
  const summary = summarise(state)
  const ranked = [...summary.byMachine].sort((a, b) => b.baselineT - a.baselineT)
  const top = ranked[0]
  const options = allOptions(state).filter((option) => option.economics.netT > 0)

  if (question === 'start') {
    const quickWins = options.filter((option) => (option.economics.paybackYears ?? 99) <= 2).sort((a, b) => b.economics.netT - a.economics.netT).slice(0, 3)
    return {
      title: 'Start with your biggest source and your quickest wins',
      lines: [
        top ? `${top.machine.name} is your biggest source at ${t(top.baselineT)} CO₂e a year, ${Math.round(top.baselineT / Math.max(1, summary.baselineT) * 100)}% of the factory.` : 'Add machines to see your biggest source.',
        ...(quickWins.length ? ['Quick wins that pay back in two years or less:', ...quickWins.map((option) => `• ${measureById(option.measureId)?.name} on ${option.machine.name}: −${t(option.economics.netT)}/yr, payback ${option.economics.paybackYears?.toFixed(1)} years`)] : ['No quick wins under a two-year payback were found. Look at the cost-per-tonne ranking in the machine panel.']),
        'Click any machine on the map to see all its options.',
      ],
    }
  }

  if (question === 'target') {
    const plan = autoPlan(state)
    const planned = summarise({ ...state, plan })
    const reach = planned.baselineT > 0 ? (1 - planned.afterPlanT / planned.baselineT) * 100 : 0
    return {
      title: `Reaching −${state.settings.targetReductionPct}% by ${state.settings.targetYear}`,
      lines: [
        `You need to cut ${t(summary.baselineT - summary.targetT)} a year from a baseline of ${t(summary.baselineT)}.`,
        plan.length
          ? `I picked ${plan.length} actions, cheapest per tonne first. Together they cut ${Math.round(reach)}% for ${rm(planned.capexRM)} of investment and change annual costs by ${rm(planned.annualSavingRM)} (positive = saving).`
          : 'There are no measures with positive net savings for these machines yet.',
        planned.gapT > 0 ? `Even with every suitable measure, a gap of ${t(planned.gapT)} remains. Consider renewable electricity supply or deeper process changes.` : 'This plan meets the target on paper. Each estimate still needs engineering confirmation.',
      ],
      suggestedPlan: plan,
    }
  }

  if (question === 'money') {
    const best = [...options].sort((a, b) => b.economics.annualSavingRM - a.economics.annualSavingRM).slice(0, 4)
    return {
      title: 'Biggest annual cash savings',
      lines: best.length ? best.map((option) => `• ${measureById(option.measureId)?.name} on ${option.machine.name}: saves ${rm(option.economics.annualSavingRM)}/yr for ${rm(option.economics.capexRM)} up front`) : ['No money-saving measures found for the current machines.'],
    }
  }

  if (question === 'capture') {
    const capture = allOptions(state).filter((option) => option.measureId === 'chitosan-capture').sort((a, b) => b.economics.netT - a.economics.netT)[0]
    const ctx = contextFor(state)
    if (!capture) return { title: 'Chitosan capture', lines: ['Capture needs a flue-gas source such as a kiln, boiler or furnace. None of your machines has one, or capture is already in your plan.'] }
    const cheaper = options.filter((option) => option.economics.costPerTonneRM !== null && capture.economics.costPerTonneRM !== null && option.economics.costPerTonneRM < capture.economics.costPerTonneRM)
    return {
      title: 'Chitosan capture: honest numbers',
      lines: [
        `A 5% slipstream pilot on ${capture.machine.name} captures ${t(capture.economics.grossT)} a year, but its own electricity use emits ${t(capture.economics.penaltyT)} at your grid factor (${ctx.gridKgPerKWh} kg/kWh). The net result is −${t(capture.economics.netT)}.`,
        capture.economics.costPerTonneRM !== null ? `It costs about ${rm(capture.economics.costPerTonneRM)} per net tonne. ${cheaper.length} other options are cheaper per tonne, so do those first.` : 'At these settings it does not cut CO₂e overall.',
        state.measuredSorbentCapacity ? `This estimate uses your measured sorbent capacity of ${state.measuredSorbentCapacity.toFixed(2)} mmol/g.` : 'Sorbent capacity is still an assumption. Measure it on the Sensors page to make this estimate real.',
        state.measuredCaptureEfficiency ? `It uses the capture efficiency measured on the rig: ${(state.measuredCaptureEfficiency * 100).toFixed(1)}%.` : 'Capture efficiency is assumed at 90% until the rig measures it.',
        'Where capture fits: unavoidable process CO₂ (such as cement calcination) that efficiency cannot remove, with regeneration heat taken from waste heat.',
      ],
    }
  }

  const estimated = state.machines.filter((machine) => machine.quality === 'estimated')
  const estimatedShare = summary.byMachine.filter((row) => row.machine.quality === 'estimated').reduce((sum, row) => sum + row.baselineT, 0) / Math.max(1, summary.baselineT) * 100
  const withSensor = state.machines.filter((machine) => machine.sensorChannel)
  return {
    title: 'Data quality check',
    lines: [
      `${estimated.length} of ${state.machines.length} machines use estimated figures, covering ${Math.round(estimatedShare)}% of emissions.`,
      estimated.length ? `Meter these first: ${estimated.slice(0, 3).map((machine) => machine.name).join(', ')}.` : 'Every machine is marked as metered.',
      withSensor.length ? `${withSensor.length} machine(s) are linked to a live sensor.` : 'No live sensors are linked yet. Connect one on the Sensors page.',
      'Grid and fuel factors are defaults. Confirm them in Settings before any external reporting.',
    ],
  }
}
