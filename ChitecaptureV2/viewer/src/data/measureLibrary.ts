import type { Asset, AssetType, PlanSettings } from '../types/actionHub'

/**
 * Generic factory reduction-measure library.
 *
 * Every percentage, payback and cost below is an INDICATIVE PLANNING ASSUMPTION
 * used only to rank first ideas. None is a sourced or verified value.
 * Replace each estimate with a site audit, vendor quote or measured trial
 * before approval. The UI shows this caveat wherever estimates appear.
 */

export type MeasureCategory = 'Energy efficiency' | 'Heat recovery' | 'Renewable energy' | 'Fuel switching' | 'Process change' | 'Carbon capture'

export type MeasureEstimate = {
  electricitySavedMWh: number
  fuelSavedGJ: number
  directTCO2: number
  addedElectricityMWh: number
  addedFuelGJ: number
  capexMYR: number
  annualOpexChangeMYR: number
  lifetimeYears: number
}

export type ReductionMeasure = {
  measureId: string
  name: string
  category: MeasureCategory
  appliesTo: readonly AssetType[]
  /** One-line description an engineer and a sustainability lead can both read. */
  summary: string
  /** What engineering must confirm before the estimate can be trusted. */
  engineeringChecks: readonly string[]
  /** Short text describing the indicative basis of the estimate. */
  estimateBasis: string
  estimate: (asset: Asset, settings: PlanSettings) => MeasureEstimate | null
}

const empty: MeasureEstimate = { electricitySavedMWh: 0, fuelSavedGJ: 0, directTCO2: 0, addedElectricityMWh: 0, addedFuelGJ: 0, capexMYR: 0, annualOpexChangeMYR: 0, lifetimeYears: 10 }

/** Capex implied by a simple payback on the annual energy-cost saving. */
function paybackCapex(electricityMWh: number, fuelGJ: number, settings: PlanSettings, paybackYears: number) {
  return Math.round((electricityMWh * settings.electricityPriceMYRPerMWh + fuelGJ * settings.fuelPriceMYRPerGJ) * paybackYears)
}

function electricityMeasure(fraction: number, paybackYears: number, lifetimeYears: number) {
  return (asset: Asset, settings: PlanSettings): MeasureEstimate | null => {
    if (asset.electricityMWh <= 0) return null
    const saved = asset.electricityMWh * fraction
    return { ...empty, electricitySavedMWh: saved, capexMYR: paybackCapex(saved, 0, settings, paybackYears), lifetimeYears }
  }
}

function fuelMeasure(fraction: number, paybackYears: number, lifetimeYears: number) {
  return (asset: Asset, settings: PlanSettings): MeasureEstimate | null => {
    if (asset.fuelGJ <= 0) return null
    const saved = asset.fuelGJ * fraction
    return { ...empty, fuelSavedGJ: saved, capexMYR: paybackCapex(0, saved, settings, paybackYears), lifetimeYears }
  }
}

export const measureLibrary: readonly ReductionMeasure[] = [
  {
    measureId: 'vsd',
    name: 'Variable-speed drive on fans and pumps',
    category: 'Energy efficiency',
    appliesTo: ['Fan / blower', 'Pump', 'Motor drive'],
    summary: 'Match motor speed to the real flow demand instead of throttling with dampers or valves.',
    engineeringChecks: ['Log the load profile for at least one week', 'Confirm the motor is suitable for inverter duty', 'Check harmonics on the supply'],
    estimateBasis: 'Indicative 20% of the asset’s electricity with a 2-year payback',
    estimate: electricityMeasure(0.2, 2, 15),
  },
  {
    measureId: 'compressed-air',
    name: 'Compressed-air leak repair and pressure reduction',
    category: 'Energy efficiency',
    appliesTo: ['Air compressor'],
    summary: 'Find and fix leaks with an ultrasonic survey, then lower the header pressure to what users need.',
    engineeringChecks: ['Run an ultrasonic leak survey', 'Measure the no-load (leak) consumption on a weekend', 'Confirm the minimum pressure each end user needs'],
    estimateBasis: 'Indicative 20% of the compressor’s electricity with a 6-month payback',
    estimate: electricityMeasure(0.2, 0.5, 5),
  },
  {
    measureId: 'premium-motor',
    name: 'Premium-efficiency motor replacement',
    category: 'Energy efficiency',
    appliesTo: ['Motor drive', 'Fan / blower', 'Pump', 'Mill / grinder', 'Air compressor'],
    summary: 'Replace old or rewound motors with premium-efficiency motors at failure or during a planned shutdown.',
    engineeringChecks: ['Check the existing motor efficiency class and rewind history', 'Confirm the frame size and mounting'],
    estimateBasis: 'Indicative 3% of the asset’s electricity with a 4-year payback',
    estimate: electricityMeasure(0.03, 4, 20),
  },
  {
    measureId: 'chiller',
    name: 'Chiller and HVAC optimisation',
    category: 'Energy efficiency',
    appliesTo: ['Chiller / HVAC', 'Building'],
    summary: 'Raise chilled-water setpoints, sequence the chillers and fix the controls schedule.',
    engineeringChecks: ['Trend the chiller kW/RT', 'Review the occupancy and process cooling schedules'],
    estimateBasis: 'Indicative 15% of the asset’s electricity with a 2-year payback',
    estimate: electricityMeasure(0.15, 2, 10),
  },
  {
    measureId: 'led',
    name: 'LED lighting with occupancy controls',
    category: 'Energy efficiency',
    appliesTo: ['Lighting', 'Building'],
    summary: 'Replace high-bay and office lighting with LEDs, plus occupancy and daylight sensors.',
    engineeringChecks: ['Complete a fixture count and check operating hours', 'Confirm the lux requirements per area'],
    estimateBasis: 'Indicative 50% of lighting electricity (20% for a whole building) with a 2.5-year payback',
    estimate: (asset, settings) => electricityMeasure(asset.type === 'Lighting' ? 0.5 : 0.2, 2.5, 12)(asset, settings),
  },
  {
    measureId: 'solar-pv',
    name: 'Rooftop solar PV',
    category: 'Renewable energy',
    appliesTo: ['Building'],
    summary: 'Generate part of the site’s daytime electricity on the roof.',
    engineeringChecks: ['Run a roof structural assessment', 'Check the grid connection and export rules', 'Compare the daytime load profile with the generation profile'],
    estimateBasis: 'Indicative 30% of the building’s electricity with a 6-year payback',
    estimate: electricityMeasure(0.3, 6, 25),
  },
  {
    measureId: 'combustion-tuning',
    name: 'Combustion tuning and O₂ trim',
    category: 'Energy efficiency',
    appliesTo: ['Boiler', 'Kiln / furnace'],
    summary: 'Reduce excess air with oxygen-trim control and regular burner tuning.',
    engineeringChecks: ['Run a flue-gas analysis at several loads', 'Check the burner turndown and the analyser location'],
    estimateBasis: 'Indicative 3% of the asset’s fuel with a 1-year payback',
    estimate: fuelMeasure(0.03, 1, 10),
  },
  {
    measureId: 'insulation',
    name: 'Insulation and refractory repair',
    category: 'Energy efficiency',
    appliesTo: ['Boiler', 'Kiln / furnace'],
    summary: 'Fix hot spots, uninsulated valves and damaged refractory found by thermal imaging.',
    engineeringChecks: ['Run a thermal-imaging survey', 'Align the work with the shutdown schedule'],
    estimateBasis: 'Indicative 2% of the asset’s fuel with a 1.5-year payback',
    estimate: fuelMeasure(0.02, 1.5, 10),
  },
  {
    measureId: 'whr-power',
    name: 'Waste-heat recovery to power',
    category: 'Heat recovery',
    appliesTo: ['Kiln / furnace'],
    summary: 'Turn hot exhaust gas into electricity that offsets grid purchases.',
    engineeringChecks: ['Measure the exhaust temperature and flow', 'Run an ORC or steam-cycle feasibility study', 'Check the plot space'],
    estimateBasis: 'Indicative recovery of 3% of the asset’s fuel energy as electricity with a 5-year payback',
    estimate: (asset, settings) => {
      if (asset.fuelGJ <= 0) return null
      const generatedMWh = asset.fuelGJ * 0.03 / 3.6
      return { ...empty, electricitySavedMWh: generatedMWh, capexMYR: paybackCapex(generatedMWh, 0, settings, 5), annualOpexChangeMYR: Math.round(generatedMWh * settings.electricityPriceMYRPerMWh * 0.05), lifetimeYears: 20 }
    },
  },
  {
    measureId: 'biomass-cofiring',
    name: 'Biomass or alternative-fuel co-firing',
    category: 'Fuel switching',
    appliesTo: ['Boiler', 'Kiln / furnace'],
    summary: 'Replace part of the fossil fuel with biomass residues such as palm kernel shell or wood waste.',
    engineeringChecks: ['Check fuel supply security and moisture content', 'Assess the impact on product quality and emissions permits', 'Agree a biogenic-CO₂ accounting rule with the sustainability team'],
    estimateBasis: 'Indicative replacement of 20% of the fossil fuel; capex of MYR 150 per t CO₂e/yr avoided; the fuel price difference is entered as an opex change',
    estimate: (asset, settings) => {
      if (asset.fuelGJ <= 0) return null
      const avoided = asset.fuelGJ * 0.2 * settings.fuelFactorKgPerGJ / 1_000
      return { ...empty, directTCO2: avoided, capexMYR: Math.round(avoided * 150), lifetimeYears: 15 }
    },
  },
  {
    measureId: 'clinker-substitution',
    name: 'Lower clinker ratio (supplementary materials)',
    category: 'Process change',
    appliesTo: ['Kiln / furnace'],
    summary: 'Blend more supplementary cementitious materials, such as slag, fly ash or calcined clay, to reduce process CO₂.',
    engineeringChecks: ['Check product standards and strength testing', 'Confirm local material supply'],
    estimateBasis: 'Indicative 10% cut in process CO₂; capex of MYR 100 per t CO₂/yr',
    estimate: (asset) => {
      if (asset.processTCO2 <= 0) return null
      const avoided = asset.processTCO2 * 0.1
      return { ...empty, directTCO2: avoided, capexMYR: Math.round(avoided * 100), lifetimeYears: 15 }
    },
  },
  {
    measureId: 'sorbent-capture-pilot',
    name: 'Solid-sorbent CO₂ capture slipstream pilot',
    category: 'Carbon capture',
    appliesTo: ['Kiln / furnace', 'Boiler'],
    summary: 'Treat a 5% slipstream of the flue gas with an amine-functionalised solid sorbent, such as chitosan, regenerated with waste heat.',
    engineeringChecks: ['Measure the sorbent working capacity on a bench rig', 'Confirm the waste-heat temperature and duty for regeneration', 'Identify a CO₂ use or storage route', 'Check SO₂ and particulate pre-treatment'],
    estimateBasis: 'Indicative 5% slipstream at 90% capture; 0.25 MWh/t electricity penalty (fans, vacuum, compression) with regeneration heat from waste heat; capex of MYR 1,500 per t CO₂/yr. The penalty rises sharply if regeneration heat must be bought.',
    estimate: (asset, settings) => {
      const pointSourceTCO2 = asset.processTCO2 + asset.fuelGJ * settings.fuelFactorKgPerGJ / 1_000
      if (pointSourceTCO2 <= 0) return null
      const captured = pointSourceTCO2 * 0.05 * 0.9
      return { ...empty, directTCO2: captured, addedElectricityMWh: captured * 0.25, capexMYR: Math.round(captured * 1_500), annualOpexChangeMYR: Math.round(captured * 60), lifetimeYears: 15 }
    },
  },
]

export function getMeasure(measureId: string) {
  return measureLibrary.find((measure) => measure.measureId === measureId)
}

export type Suggestion = { asset: Asset; measure: ReductionMeasure; estimate: MeasureEstimate }

/** Every applicable measure for every asset, excluding asset–measure pairs that already have a project. */
export function suggestOpportunities(assets: Asset[], settings: PlanSettings, existing: { assetId: string; measureId: string }[]): Suggestion[] {
  const taken = new Set(existing.map((item) => `${item.assetId}::${item.measureId}`))
  return assets.flatMap((asset) => measureLibrary
    .filter((measure) => measure.appliesTo.includes(asset.type) && !taken.has(`${asset.assetId}::${measure.measureId}`))
    .map((measure) => ({ asset, measure, estimate: measure.estimate(asset, settings) }))
    .filter((item): item is Suggestion => item.estimate !== null))
}
