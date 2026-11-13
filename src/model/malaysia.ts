/**
 * Malaysia-specific context: where a site is, which grid it draws from, and which Malaysian rules
 * and programmes apply to it. Facts checked 13 November 2026; each item names its source and says
 * plainly when something is not yet confirmed.
 */
import { annual, defaultSteelParams, intensity, noUpgrades, type SteelParams } from './steel'
import type { FactoryState } from './types'

export type MyState = { id: string; label: string; gridRegionId: 'my-peninsular' | 'my-sabah' | 'my-sarawak'; utility: string }

/** States and federal territories. Labuan is supplied by Sabah Electricity (SESB), on the Sabah grid. */
export const myStates: readonly MyState[] = [
  { id: 'johor', label: 'Johor', gridRegionId: 'my-peninsular', utility: 'TNB' },
  { id: 'kedah', label: 'Kedah', gridRegionId: 'my-peninsular', utility: 'TNB' },
  { id: 'kelantan', label: 'Kelantan', gridRegionId: 'my-peninsular', utility: 'TNB' },
  { id: 'melaka', label: 'Melaka', gridRegionId: 'my-peninsular', utility: 'TNB' },
  { id: 'negeri-sembilan', label: 'Negeri Sembilan', gridRegionId: 'my-peninsular', utility: 'TNB' },
  { id: 'pahang', label: 'Pahang', gridRegionId: 'my-peninsular', utility: 'TNB' },
  { id: 'penang', label: 'Pulau Pinang', gridRegionId: 'my-peninsular', utility: 'TNB' },
  { id: 'perak', label: 'Perak', gridRegionId: 'my-peninsular', utility: 'TNB' },
  { id: 'perlis', label: 'Perlis', gridRegionId: 'my-peninsular', utility: 'TNB' },
  { id: 'selangor', label: 'Selangor', gridRegionId: 'my-peninsular', utility: 'TNB' },
  { id: 'terengganu', label: 'Terengganu', gridRegionId: 'my-peninsular', utility: 'TNB' },
  { id: 'kuala-lumpur', label: 'W.P. Kuala Lumpur', gridRegionId: 'my-peninsular', utility: 'TNB' },
  { id: 'putrajaya', label: 'W.P. Putrajaya', gridRegionId: 'my-peninsular', utility: 'TNB' },
  { id: 'labuan', label: 'W.P. Labuan', gridRegionId: 'my-sabah', utility: 'SESB' },
  { id: 'sabah', label: 'Sabah', gridRegionId: 'my-sabah', utility: 'SESB' },
  { id: 'sarawak', label: 'Sarawak', gridRegionId: 'my-sarawak', utility: 'Sarawak Energy' },
]

/** Major industrial areas, so a site can be placed where Malaysian heavy industry actually sits. */
export const industrialParks: readonly { name: string; stateId: string }[] = [
  { name: 'Prai Industrial Estate', stateId: 'penang' },
  { name: 'Bayan Lepas Free Industrial Zone', stateId: 'penang' },
  { name: 'Kulim Hi-Tech Park', stateId: 'kedah' },
  { name: 'Bukit Raja / Klang', stateId: 'selangor' },
  { name: 'Port Klang Free Zone', stateId: 'selangor' },
  { name: 'Shah Alam', stateId: 'selangor' },
  { name: 'Nilai', stateId: 'negeri-sembilan' },
  { name: 'Pasir Gudang', stateId: 'johor' },
  { name: 'Tanjung Langsat', stateId: 'johor' },
  { name: 'Gebeng, Kuantan', stateId: 'pahang' },
  { name: 'Malaysia-China Kuantan Industrial Park (MCKIP)', stateId: 'pahang' },
  { name: 'Kemaman / Teluk Kalung', stateId: 'terengganu' },
  { name: 'Kerteh', stateId: 'terengganu' },
  { name: 'Lumut / Manjung', stateId: 'perak' },
  { name: 'Kota Kinabalu Industrial Park (KKIP)', stateId: 'sabah' },
  { name: 'Samalaju Industrial Park, Bintulu', stateId: 'sarawak' },
  { name: 'Tanjung Kidurong, Bintulu', stateId: 'sarawak' },
]

export const stateById = (id: string | undefined) => myStates.find((item) => item.id === id)
export const parksIn = (stateId: string | undefined) => industrialParks.filter((park) => park.stateId === stateId)

/** Sample sites are placed in typical Malaysian industrial areas (illustrative, not real plants). */
export const sampleLocations: Record<string, { stateId: string; park: string }> = {
  steel: { stateId: 'penang', park: 'Prai Industrial Estate' },
  'steel-downstream': { stateId: 'selangor', park: 'Bukit Raja / Klang' },
  office: { stateId: 'kuala-lumpur', park: '' },
  cement: { stateId: 'perak', park: 'Lumut / Manjung' },
}

export { GET_PREMIUM_RM_PER_MWH } from './prices'

export const EECA_THRESHOLD_GJ = 21_600

export type Applicability = 'applies' | 'likely' | 'check' | 'not-applicable'
export type Programme = { id: string; name: string; kind: 'rule' | 'incentive' | 'market'; status: Applicability; why: string; action: string; source: string; url: string }

export function siteEnergyGJ(state: FactoryState) {
  return state.machines.reduce((sum, machine) => sum + machine.electricityMWh * 3.6 + machine.fuelGJ, 0)
}

const steelLike = (industryId: string) => industryId === 'steel' || industryId === 'steel-downstream'

/** The Malaysian rules, incentives and markets that matter for this site, and whether each applies. */
export function programmesFor(state: FactoryState): Programme[] {
  const { settings } = state
  const where = stateById(settings.stateId)
  const grid = where?.gridRegionId ?? settings.gridRegionId
  const peninsularOrLabuan = grid === 'my-peninsular' || settings.stateId === 'labuan'
  const gj = siteEnergyGJ(state)
  const industry = settings.industryId
  const cbamGoods = steelLike(industry) || industry === 'cement'
  const list: Programme[] = [
    {
      id: 'eeca', name: 'Energy Efficiency and Conservation Act 2024 (Act 861)', kind: 'rule',
      status: !peninsularOrLabuan ? 'not-applicable' : gj >= EECA_THRESHOLD_GJ ? 'applies' : 'not-applicable',
      why: !peninsularOrLabuan
        ? `The Act covers Peninsular Malaysia and Labuan; ${where?.label ?? 'this region'} is outside it.`
        : `This site uses ${Math.round(gj).toLocaleString('en-MY')} GJ a year against the ${EECA_THRESHOLD_GJ.toLocaleString('en-MY')} GJ threshold.`,
      action: 'Appoint a registered energy manager, run an energy management system, carry out an energy audit and submit energy reports to the Energy Commission.',
      source: 'Energy Commission (Suruhanjaya Tenaga)', url: 'https://www.st.gov.my/stakeholders/energy-efficiency/energy-efficiency-and-conservation-act-eeca-2024',
    },
    {
      id: 'carbon-tax', name: 'Malaysian carbon tax', kind: 'rule',
      status: steelLike(industry) ? 'likely' : 'check',
      why: steelLike(industry)
        ? 'Budget 2026 named iron and steel (and energy) as the first sectors. No rate or start date is confirmed yet.'
        : 'Announced first for iron, steel and energy. Other sectors may follow.',
      action: 'Keep verified Scope 1 data now, so the tax is paid on real emissions and reductions count.',
      source: 'Argus Media on Budget 2026; Cobler on status after Budget 2027', url: 'https://cobler.io/blog/carbon-tax-malaysia',
    },
    {
      id: 'cbam', name: 'EU Carbon Border Adjustment Mechanism (CBAM)', kind: 'rule',
      status: cbamGoods ? 'applies' : 'not-applicable',
      why: cbamGoods
        ? 'Steel, wire and cement sold to the EU pay for their embedded emissions from 2026. Malaysia exported about 752,000 t of steel to the EU in 2025.'
        : 'This product is not a CBAM good.',
      action: 'Give EU buyers verified installation data so they do not fall back on higher default values.',
      source: 'European Commission; CBAM Guide (Malaysia)', url: 'https://cbamguide.com/countries/malaysia/',
    },
    {
      id: 'bursa', name: 'Bursa Malaysia sustainability reporting (CSI platform, NSRF)', kind: 'rule',
      status: 'check',
      why: 'Listed companies report Scope 1 and 2 emissions; their large suppliers are increasingly asked for the same data.',
      action: 'Export the Site carbon report; the figures map to the CSI Scope 1 and 2 calculators.',
      source: 'Bursa Malaysia', url: 'https://assist.bursamalaysia.com/hc/en-us/articles/14367398931087-What-is-the-Centralised-Sustainability-Intelligence-CSI-Solution',
    },
    {
      id: 'get', name: grid === 'my-peninsular' ? 'TNB Green Electricity Tariff (GET)' : 'Green electricity from the local utility', kind: 'market',
      status: grid === 'my-peninsular' ? 'applies' : 'check',
      why: grid === 'my-peninsular'
        ? 'Buy renewable electricity for a premium of 3–5 sen/kWh (since 1 July 2025). It cuts market-based Scope 2 emissions.'
        : grid === 'my-sarawak'
          ? 'Sarawak’s grid is mostly hydropower (0.199 kg CO₂/kWh), so Scope 2 is already low.'
          : `Ask ${where?.utility ?? 'the utility'} about renewable supply options.`,
      action: 'Use the “Green electricity” slider in the simulations to see the effect.',
      source: 'Tenaga Nasional Berhad', url: 'https://www.tnb.com.my/GET',
    },
    {
      id: 'gita', name: 'Green Investment Tax Allowance (GITA)', kind: 'incentive',
      status: 'likely',
      why: 'Energy-efficiency and renewable-energy assets qualified for a 60% allowance offset against 70% of statutory income (2024 framework). MIDA has announced an extension to 31 December 2030 under a revised framework.',
      action: 'Check the current rates with MIDA before counting the allowance in a payback.',
      source: 'Malaysian Investment Development Authority (MIDA)', url: 'https://www.mida.gov.my/wp-content/uploads/2023/12/HORIZONTAL-of-Green-Incentives-Budget-2024.pdf',
    },
  ]
  return list
}

/**
 * Published Scope 1+2 intensities from a Malaysian scrap-EAF steelmaker, used to cross-check the
 * sample mill. Masteel (Malaysia Steel Works (KL) Bhd) reports separately for its steelmaking plant
 * and its rolling mill. Its rolling mill uses direct casting and direct rolling, so it burns no
 * reheating gas; our sample mill uses a conventional gas reheating furnace.
 */
export const masteelBenchmark = [
  { year: 'FY2024', steelmakingT: 0.489, rollingT: 0.112, source: 'Masteel Sustainability Report 2024', url: 'https://www.masteel.com.my/wp-content/uploads/2025/05/optimized_full_masteel_sustainability_report_fy2024_complete.pdf' },
  { year: 'FY2025', steelmakingT: 0.456, rollingT: 0.085, source: 'Masteel sustainability page (FY2025)', url: 'https://www.masteel.com.my/masteel-sustainability/' },
] as const

/** worldsteel 2023 average for the scrap-EAF route, as reported by IRENA (t CO₂ per t crude steel). */
export const WORLD_SCRAP_EAF_T = 0.7

export type CrossCheck = { label: string; ours: number; theirs: number; theirsLabel: string; diffPct: number; comparable: boolean; note: string }

/** Split our sample mill into the same two parts Masteel reports, and compare. */
export function steelCrossCheck(p: SteelParams = defaultSteelParams): CrossCheck[] {
  const i = intensity(p, noUpgrades)
  const meltKWh = i.kwh.eaf + i.kwh.lf + i.kwh.caster + i.kwh.fume + i.kwh.utilities + i.kwh.oxygen
  const steelmaking = (meltKWh * p.gridKgPerKWh + i.eafDirectKgPerT) / 1_000
  const rollingElectric = i.kwh.rolling * p.gridKgPerKWh / 1_000
  const total = i.totalKgPerT / 1_000
  const [fy24, fy25] = masteelBenchmark
  const pct = (a: number, b: number) => (a - b) / b * 100
  const avgMelt = (fy24.steelmakingT + fy25.steelmakingT) / 2
  const avgRoll = (fy24.rollingT + fy25.rollingT) / 2
  const avgBoth = avgMelt + avgRoll
  const noGas = steelmaking + rollingElectric
  return [
    { label: 'Steelmaking plant (arc furnace to caster)', ours: steelmaking, theirs: avgMelt, theirsLabel: `Masteel ${fy25.steelmakingT}–${fy24.steelmakingT}`, diffPct: pct(steelmaking, avgMelt), comparable: true, note: 'Same route (scrap EAF), same grid (Peninsular), same scopes. The closest like-for-like check.' },
    { label: 'Rolling mill, electricity only', ours: rollingElectric, theirs: avgRoll, theirsLabel: `Masteel ${fy25.rollingT}–${fy24.rollingT}`, diffPct: pct(rollingElectric, avgRoll), comparable: true, note: 'Our 100 kWh/t rolling figure is on the low side; Masteel’s implies about 110–150 kWh/t. A real mill’s meters would replace it.' },
    { label: 'Whole mill without reheating gas', ours: noGas, theirs: avgBoth, theirsLabel: `Masteel ${(fy25.steelmakingT + fy25.rollingT).toFixed(3)}–${(fy24.steelmakingT + fy24.rollingT).toFixed(3)}`, diffPct: pct(noGas, avgBoth), comparable: true, note: 'Masteel rolls billets straight from the caster and burns no reheating gas, so this is the like-for-like whole-mill figure.' },
    { label: 'Whole mill with gas reheating', ours: total, theirs: WORLD_SCRAP_EAF_T, theirsLabel: `World scrap-EAF average ${WORLD_SCRAP_EAF_T}`, diffPct: pct(total, WORLD_SCRAP_EAF_T), comparable: true, note: 'Our sample mill reheats billets with natural gas. It sits below the world average for the route, as expected for a modern mill on a 0.74 kg/kWh grid.' },
  ]
}

export const sampleAnnualSteelT = () => annual(defaultSteelParams, noUpgrades).steelT
