/** Molar volume of an ideal gas at 0 °C and 1 atm (L/mol), matching a flow meter calibrated to standard litres. */
const MOLAR_VOLUME_L = 22.414

export type RigSample = { at: number; co2_in: number; co2_out: number }

export type RigResult = {
  capturedMmol: number
  capacityMmolPerG: number
  captureEfficiencyPct: number
  /** Outlet/inlet ratio of the latest sample: 0 = everything captured, 1 = bed saturated. */
  breakthrough: number
}

/**
 * Integrate the CO₂ removed by a packed sorbent column from inlet and outlet readings.
 * captured (mol) = Σ (C_in − C_out) [ppm] × 1e-6 × flow [L/min] ÷ 22.414 L/mol × Δt [min]
 * Uses trapezoidal integration between consecutive samples.
 */
export function analyseRig(samples: RigSample[], flowLPerMin: number, sorbentMassG: number): RigResult {
  let capturedMol = 0
  let inletMol = 0
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1], current = samples[index]
    const minutes = (current.at - previous.at) / 60_000
    if (minutes <= 0 || minutes > 5) continue
    const deltaPpm = (Math.max(0, previous.co2_in - previous.co2_out) + Math.max(0, current.co2_in - current.co2_out)) / 2
    const inletPpm = (previous.co2_in + current.co2_in) / 2
    capturedMol += deltaPpm * 1e-6 * flowLPerMin / MOLAR_VOLUME_L * minutes
    inletMol += inletPpm * 1e-6 * flowLPerMin / MOLAR_VOLUME_L * minutes
  }
  const last = samples.at(-1)
  return {
    capturedMmol: capturedMol * 1_000,
    capacityMmolPerG: sorbentMassG > 0 ? capturedMol * 1_000 / sorbentMassG : 0,
    captureEfficiencyPct: inletMol > 0 ? capturedMol / inletMol * 100 : 0,
    breakthrough: last && last.co2_in > 0 ? Math.min(1, Math.max(0, last.co2_out / last.co2_in)) : 0,
  }
}
