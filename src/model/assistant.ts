import { tonnes, ringgit } from '../format'
import { EU_CARBON_PRICE_EUR, RM_PER_EUR } from './prices'
import { contextFor, machineEmissions, optionsFor, summarise, type Option } from './calc'
import { answer as copilotAnswer, allOptions } from './copilot'
import { measureById } from './measures'
import { cbamPhaseIn } from './steel'
import type { FactoryState, Machine } from './types'

/**
 * The built-in assistant. It understands the questions a plant team asks most ("which process should
 * we cut?", "save RM 2m", "cut 30%", "what if we shut the ladle furnace?") and answers with the
 * site's own numbers, so it works offline and needs no API key. Open questions go to the real AI
 * when one is configured (see aiClient.ts); this answers everything else.
 */

export type SuggestedAction = { machineId: string; measureId: string; label: string }
export type AssistantReply = { lines: string[]; actions?: SuggestedAction[]; understood: boolean }

/** An illustrative carbon price for "what does our carbon cost" questions; the user can name another. */
export const DEFAULT_CARBON_PRICE_RM = 50

const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9%.,₂ ]+/g, ' ')
const has = (text: string, ...keys: string[]) => keys.some((key) => text.includes(key))
const pct = (part: number, whole: number) => `${Math.round(part / Math.max(1, whole) * 100)}%`
const measureName = (option: Option) => measureById(option.measureId)?.name ?? option.measureId
const describe = (option: Option) => {
  const e = option.economics
  const payback = e.paybackYears !== null ? `, payback ${e.paybackYears.toFixed(1)} yr` : ''
  const cost = e.capexRM > 0 ? `, costs ${ringgit(e.capexRM)}` : ''
  return `${measureName(option)} on ${option.machine.name}: −${tonnes(e.netT)} CO₂/yr${cost}${e.annualSavingRM > 0 ? `, saves ${ringgit(e.annualSavingRM)}/yr` : ''}${payback}`
}
const toAction = (option: Option): SuggestedAction => ({ machineId: option.machine.id, measureId: option.measureId, label: `${measureById(option.measureId)?.short ?? 'Action'} · ${option.machine.name}` })

/** Reads "RM 2m", "RM2 million", "RM 500k", "RM 1,200,000". */
export function parseRinggit(text: string): number | null {
  const match = text.toLowerCase().match(/rm\s*([\d.,]+)\s*(million|mil|m|k|thousand|b|billion)?\b/)
  if (!match) return null
  const value = Number(match[1].replace(/,/g, ''))
  if (!Number.isFinite(value)) return null
  const unit = match[2] ?? ''
  const scale = unit.startsWith('b') ? 1e9 : unit.startsWith('m') ? 1e6 : unit.startsWith('k') || unit.startsWith('t') ? 1e3 : 1
  return value * scale
}

/** Reads "30%" or "30 percent". */
export function parsePercent(text: string): number | null {
  const match = text.toLowerCase().match(/(\d+(?:\.\d+)?)\s*(%|percent|per cent)/)
  return match ? Number(match[1]) : null
}

/** Reads "50,000 t", "50 kt", "20000 tonnes". */
export function parseTonnes(text: string): number | null {
  const match = text.toLowerCase().match(/([\d.,]+)\s*(kt|k t|kilotonnes?|t|tonnes?|tons?)\b/)
  if (!match) return null
  const value = Number(match[1].replace(/,/g, ''))
  return Number.isFinite(value) ? value * (match[2].startsWith('k') ? 1_000 : 1) : null
}

/** Finds the machine a question names, by full name or a distinctive word ("arc furnace", "EAF", "kiln"). */
export function findMachine(text: string, machines: Machine[]): Machine | null {
  const q = ` ${words(text)} `
  const aliases: Record<string, string[]> = { eaf: ['electric arc furnace'], 'arc furnace': ['electric arc furnace'], lf: ['ladle furnace'], caster: ['continuous caster'], 'reheat': ['reheating furnace'], aircon: ['central air-conditioning'], genset: ['genset'] }
  for (const [alias, targets] of Object.entries(aliases)) {
    if (q.includes(` ${alias}`)) {
      const hit = machines.find((machine) => targets.some((target) => machine.name.toLowerCase().includes(target)))
      if (hit) return hit
    }
  }
  const exact = machines.find((machine) => q.includes(machine.name.toLowerCase()))
  if (exact) return exact
  const generic = new Set(['line', 'plant', 'machines', 'system', 'room', 'office', 'water', 'compressed', 'air', 'fans', 'and'])
  let best: { machine: Machine; score: number } | null = null
  for (const machine of machines) {
    const tokens = machine.name.toLowerCase().split(/[^a-z]+/).filter((token) => token.length >= 4 && !generic.has(token))
    const score = tokens.filter((token) => q.includes(token)).length
    if (score > 0 && (!best || score > best.score)) best = { machine, score }
  }
  return best?.machine ?? null
}

/** Greedy pick of options until a goal is met. One measure per machine and category. */
function pick(options: Option[], key: (option: Option) => number, goal: number) {
  const chosen: Option[] = []
  const used = new Set<string>()
  let total = 0
  for (const option of options) {
    if (total >= goal) break
    const slot = `${option.machine.id}:${measureById(option.measureId)?.category}`
    if (used.has(slot)) continue
    used.add(slot)
    chosen.push(option)
    total += key(option)
  }
  return { chosen, total }
}

export function reply(question: string, state: FactoryState): AssistantReply {
  const q = words(question)
  const summary = summarise(state)
  const site = state.settings.factoryName
  const options = allOptions(state).filter((option) => option.economics.netT > 0)
  const ranked = [...summary.byMachine].sort((a, b) => b.baselineT - a.baselineT)
  const money = parseRinggit(question)
  const percent = parsePercent(question)
  const tonnesGoal = parseTonnes(question)
  const perTonnePrice = /rm\s*[\d.,]+\s*(\/|per)\s*(t|tonne|ton)\b/i.test(question) ? money : null
  const machine = findMachine(question, state.machines)

  if (!q.trim() || /^(hi|hello|hey|help)\b/.test(q.trim())) {
    return { understood: true, lines: [
      `Hi! I can answer with ${site}’s own numbers. Try:`,
      '• “Which process should we cut first?”',
      '• “How do we save RM 2 million a year?”',
      '• “Cut emissions by 30%”',
      '• “What if we shut down the ladle furnace?”',
      '• “What is our carbon cost at RM 80 per tonne?”',
    ] }
  }

  // What if we stop / cut a specific process?
  if (machine && has(q, 'shut', 'stop', 'remove', 'without', 'close', 'turn off', 'switch off', 'cut', 'eliminate', 'drop')) {
    const row = summary.byMachine.find((item) => item.machine.id === machine.id)
    const removed = row?.baselineT ?? 0
    const best = optionsFor(machine, state).filter((option) => option.economics.netT > 0).slice(0, 2)
    return { understood: true, actions: best.map(toAction), lines: [
      `Shutting ${machine.name} would remove ${tonnes(removed)} CO₂ a year, ${pct(removed, summary.baselineT)} of ${site} (${tonnes(summary.baselineT)} → ${tonnes(summary.baselineT - removed)}).`,
      machine.role ? `But it ${machine.role.charAt(0).toLowerCase()}${machine.role.slice(1).replace(/\.$/, '')}, so stopping it usually stops or moves production rather than cutting carbon per tonne.` : 'Check what production depends on it before stopping it.',
      ...(best.length ? ['Cutting its carbon while keeping it running:', ...best.map((option) => `• ${describe(option)}`)] : ['No upgrade options are in the library for it yet.']),
    ] }
  }

  // Carbon cost / carbon tax exposure
  if (has(q, 'carbon tax', 'carbon price', 'carbon cost', 'pay for carbon', 'tax')) {
    const price = perTonnePrice ?? DEFAULT_CARBON_PRICE_RM
    const top = ranked.slice(0, 3)
    return { understood: true, lines: [
      `At ${ringgit(price)} per tonne, ${site}’s ${tonnes(summary.baselineT)} a year would cost about ${ringgit(summary.baselineT * price)} a year in carbon.`,
      summary.plannedReductionT > 0 ? `Your current plan cuts that to ${ringgit(summary.afterPlanT * price)} (−${ringgit(summary.plannedReductionT * price)}).` : 'Add actions to the plan to see how much that falls.',
      'Biggest contributors:',
      ...top.map((row) => `• ${row.machine.name}: ${ringgit(row.baselineT * price)}/yr`),
      perTonnePrice ? '' : `I used an example price of RM ${DEFAULT_CARBON_PRICE_RM}/t; Malaysia’s rate isn’t confirmed yet. Ask e.g. “carbon cost at RM 80 per tonne”.`,
    ].filter(Boolean) }
  }

  // Money target: "save RM 2m", "cut costs"
  if (has(q, 'save', 'saving', 'cost', 'money', 'cheaper', 'profit', 'budget', 'ringgit') || (money !== null && !perTonnePrice)) {
    // For a money goal, quickest payback first reaches the saving with the least investment.
    const earners = [...options].filter((option) => option.economics.annualSavingRM > 0)
      .sort(money ? (a, b) => (a.economics.paybackYears ?? 99) - (b.economics.paybackYears ?? 99) : (a, b) => b.economics.annualSavingRM - a.economics.annualSavingRM)
    if (!earners.length) return { understood: true, lines: ['None of the measures for this site saves money on energy at today’s prices. Check the electricity and fuel prices in Settings.'] }
    const goal = money ?? Number.POSITIVE_INFINITY
    const { chosen, total } = pick(earners, (option) => option.economics.annualSavingRM, goal)
    const shown = money ? chosen : chosen.slice(0, 4)
    const carbon = shown.reduce((sum, option) => sum + option.economics.netT, 0)
    const capex = shown.reduce((sum, option) => sum + option.economics.capexRM, 0)
    const saved = money ? total : shown.reduce((sum, option) => sum + option.economics.annualSavingRM, 0)
    return { understood: true, actions: shown.map(toAction), lines: [
      money ? (total >= money ? `To save ${ringgit(money)} a year, quickest payback first, I’d do ${shown.length === 1 ? 'this' : `these ${shown.length}`}:` : `The best I can find saves ${ringgit(total)} a year, short of ${ringgit(money)}:`) : 'Biggest yearly savings for this site:',
      ...shown.map((option) => `• ${describe(option)}`),
      `Together: saves ${ringgit(saved)}/yr and cuts ${tonnes(carbon)} CO₂/yr (${pct(carbon, summary.baselineT)}), for about ${ringgit(capex)} up front.`,
    ] }
  }

  // Emission target: "cut 30%", "reduce 50,000 t"
  if ((percent !== null || tonnesGoal !== null) && has(q, 'cut', 'reduce', 'lower', 'target', 'hit', 'reach', 'decrease', 'drop', 'emission', 'co2', 'co₂', 'carbon')) {
    const goal = percent !== null ? summary.baselineT * percent / 100 : tonnesGoal!
    const cheapest = [...options].filter((option) => option.economics.costPerTonneRM !== null).sort((a, b) => a.economics.costPerTonneRM! - b.economics.costPerTonneRM!)
    const { chosen, total } = pick(cheapest, (option) => option.economics.netT, goal)
    const capex = chosen.reduce((sum, option) => sum + option.economics.capexRM, 0)
    const yearly = chosen.reduce((sum, option) => sum + option.economics.annualSavingRM, 0)
    return { understood: true, actions: chosen.map(toAction), lines: [
      `Goal: cut ${tonnes(goal)} a year (${pct(goal, summary.baselineT)} of ${tonnes(summary.baselineT)}). Cheapest per tonne first:`,
      ...chosen.map((option) => `• ${describe(option)}`),
      total >= goal ? `That reaches −${tonnes(total)} (${pct(total, summary.baselineT)}).` : `That reaches only −${tonnes(total)} (${pct(total, summary.baselineT)}). The rest needs deeper changes such as more renewable electricity.`,
      `Investment about ${ringgit(capex)}; yearly cost change ${yearly >= 0 ? `saves ${ringgit(yearly)}` : `costs ${ringgit(-yearly)}`}.`,
    ] }
  }

  if (has(q, 'cbam', 'export', 'europe', ' eu ')) {
    const production = state.settings.productionTPerYear
    if (!production) return { understood: true, lines: ['Set annual production in Settings first, so I can work out CO₂ per tonne for CBAM.'] }
    const ctx = contextFor(state)
    const directT = state.machines.reduce((sum, item) => { const e = machineEmissions(item, ctx); return sum + e.fuelT + e.processT }, 0)
    const directPerT = directT / production
    const perT = summary.baselineT / production
    const cost2034 = 100_000 * directPerT * EU_CARBON_PRICE_EUR * RM_PER_EUR * cbamPhaseIn[2034]
    return { understood: true, lines: [
      `${site} emits ${(perT * 1000).toFixed(0)} kg CO₂ per tonne of ${state.settings.productUnit} in total, of which ${(directPerT * 1000).toFixed(0)} kg is direct (fuel and process).`,
      `For 100,000 t exported to the EU at €${EU_CARBON_PRICE_EUR}/t (RM ${Math.round(EU_CARBON_PRICE_EUR * RM_PER_EUR)}/t), CBAM on the direct figure would be about ${ringgit(cost2034)} a year by 2034 (full phase-in). The Simulation page has the detailed steel CBAM view.`,
      'Verified data matter: if the importer must use an EU default value instead, the charge can be many times higher.',
    ] }
  }

  if (has(q, 'capture', 'chitosan', 'sorbent')) return fromCopilot('capture', state)
  if (has(q, 'reliable', 'accurate', 'sensor', 'meter', 'data quality')) return fromCopilot('data', state)

  // Where does the carbon come from / what should we cut?
  if (has(q, 'which', 'what', 'where', 'biggest', 'most', 'focus', 'first', 'priorit', 'component', 'part', 'process', 'cut', 'reduce', 'hotspot')) {
    if (has(q, 'quick', 'easy', 'fast', 'payback', 'cheap')) return fromCopilot('start', state)
    const top = ranked.slice(0, 3)
    const fixes = top.map((row) => optionsFor(row.machine, state).filter((option) => option.economics.netT > 0)[0]).filter((option): option is Option => Boolean(option))
    return { understood: true, actions: fixes.map(toAction), lines: [
      `${site} emits ${tonnes(summary.baselineT)} CO₂ a year. The biggest sources:`,
      ...top.map((row, index) => `${index + 1}. ${row.machine.name}: ${tonnes(row.baselineT)} (${pct(row.baselineT, summary.baselineT)})`),
      'Best fix for each, without stopping production:',
      ...fixes.map((option) => `• ${describe(option)}`),
    ] }
  }

  if (has(q, 'quick', 'easy', 'start', 'begin')) return fromCopilot('start', state)

  return { understood: false, lines: [
    'I’m not sure I understood that. I can answer questions like:',
    '• “Which process should we cut first?”',
    '• “Save RM 2 million a year”',
    '• “Cut emissions by 30%”',
    '• “What if we shut the reheating furnace?”',
  ] }
}

function fromCopilot(question: Parameters<typeof copilotAnswer>[0], state: FactoryState): AssistantReply {
  const result = copilotAnswer(question, state)
  return { understood: true, lines: [result.title, ...result.lines] }
}

/** A compact, factual summary of the site for the real AI, so it answers from the same numbers. */
export function contextForAI(state: FactoryState, companyName: string) {
  const summary = summarise(state)
  const machines = [...summary.byMachine].sort((a, b) => b.baselineT - a.baselineT).map((row) => ({
    name: row.machine.name,
    area: row.machine.area,
    role: row.machine.role,
    co2TPerYear: Math.round(row.baselineT),
    electricityMWh: Math.round(row.machine.electricityMWh),
    fuel: row.machine.fuel,
    fuelGJ: Math.round(row.machine.fuelGJ),
    options: optionsFor(row.machine, state).filter((option) => option.economics.netT > 0).slice(0, 4).map((option) => ({
      measure: measureName(option),
      cutTPerYear: Math.round(option.economics.netT),
      capexRM: Math.round(option.economics.capexRM),
      savingRMPerYear: Math.round(option.economics.annualSavingRM),
      paybackYears: option.economics.paybackYears === null ? null : Number(option.economics.paybackYears.toFixed(1)),
    })),
  }))
  return {
    company: companyName,
    site: state.settings.factoryName,
    industry: state.settings.industryId,
    productionTPerYear: state.settings.productionTPerYear,
    productUnit: state.settings.productUnit,
    totalCO2TPerYear: Math.round(summary.baselineT),
    target: { reductionPct: state.settings.targetReductionPct, year: state.settings.targetYear },
    currentPlanCutTPerYear: Math.round(summary.plannedReductionT),
    electricityPriceRMPerMWh: state.settings.electricityPriceRMPerMWh,
    machines,
  }
}
