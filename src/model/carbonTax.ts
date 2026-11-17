/**
 * Carbon tax estimate. Malaysia has announced a carbon tax for the iron, steel and energy sectors
 * but has not confirmed a rate, so the calculator uses Singapore's published carbon tax path as a
 * regional reference and converts it to ringgit. Every figure is an editable assumption.
 *
 * Singapore (Carbon Pricing Act, as amended 2022): S$5/t to 2023, S$25/t in 2024–25, S$45/t in
 * 2026–27, and S$50–80/t by 2030. 2028–29 is not fixed; we step towards the 2030 range.
 */

export type TaxPathPoint = { year: number; sgdPerT: number; note: string }

export type RateCase = 'low' | 'mid' | 'high'

/** Singapore's path, with low / mid / high readings of the 2030 range (S$50 / S$65 / S$80). */
export function singaporePath(rateCase: RateCase = 'mid'): TaxPathPoint[] {
  const by2030 = rateCase === 'low' ? 50 : rateCase === 'high' ? 80 : 65
  return [
    { year: 2024, sgdPerT: 25, note: 'Singapore, legislated' },
    { year: 2025, sgdPerT: 25, note: 'Singapore, legislated' },
    { year: 2026, sgdPerT: 45, note: 'Singapore, legislated' },
    { year: 2027, sgdPerT: 45, note: 'Singapore, legislated' },
    { year: 2028, sgdPerT: Math.round(45 + (by2030 - 45) / 3), note: 'Not fixed: stepped towards the 2030 range' },
    { year: 2029, sgdPerT: Math.round(45 + (by2030 - 45) * 2 / 3), note: 'Not fixed: stepped towards the 2030 range' },
    { year: 2030, sgdPerT: by2030, note: `Singapore target range S$50–80 (${rateCase} case)` },
  ]
}

/** Default exchange rate: S$1 ≈ RM 3.30. Editable in the calculator. */
export const RM_PER_SGD = 3.3

export type TaxInputs = {
  rateCase: RateCase
  rmPerSGD: number
  /** Emissions covered by the tax. Malaysia's design is not final; Scope 1 only is the usual basis. */
  coverage: 'scope1' | 'scope1and2'
  /** Share of emissions exempt or allowed free, 0–1 (e.g. transitional allowances). */
  exemptShare: number
}

export const defaultTaxInputs: TaxInputs = { rateCase: 'mid', rmPerSGD: RM_PER_SGD, coverage: 'scope1', exemptShare: 0 }

/** Carbon price in RM per tonne for a year, using the Singapore path (held flat after 2030). */
export function rmPerTonne(year: number, inputs: TaxInputs): number {
  const path = singaporePath(inputs.rateCase)
  const point = path.find((item) => item.year === year) ?? (year > 2030 ? path[path.length - 1] : year < 2024 ? { sgdPerT: 0 } : path[0])
  return point.sgdPerT * inputs.rmPerSGD
}

/** Tonnes of CO₂e the tax would be charged on. */
export function taxableT(scope1T: number, scope2T: number, inputs: TaxInputs) {
  const covered = inputs.coverage === 'scope1' ? scope1T : scope1T + scope2T
  return Math.max(0, covered * (1 - Math.min(1, Math.max(0, inputs.exemptShare))))
}

export type TaxYear = { year: number; rmPerT: number; taxableT: number; billRM: number }

/** The bill for each year, given each year's Scope 1 and Scope 2 tonnes. */
export function taxBill(years: { year: number; scope1T: number; scope2T: number }[], inputs: TaxInputs): TaxYear[] {
  return years.map(({ year, scope1T, scope2T }) => {
    const rate = rmPerTonne(year, inputs)
    const tonnes = taxableT(scope1T, scope2T, inputs)
    return { year, rmPerT: rate, taxableT: tonnes, billRM: rate * tonnes }
  })
}
