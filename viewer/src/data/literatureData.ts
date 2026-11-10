import { readNumberParameter, readStringParameter } from './parameters'

/** Compatibility view; values are prototype assumptions until their sources are verified. */
export const literatureData = {
  get adsorbentMaterial() { return readStringParameter('adsorbent-material') },
  get referenceAdsorptionCapacityMmolPerG() { return readNumberParameter('adsorption-capacity') },
  get co2MolarMassGramsPerMol() { return readNumberParameter('co2-molar-mass') },
  get co2DensityKgPerNm3() { return readNumberParameter('co2-density') },
  get provenance() { return 'Values use placeholder source records until verified citations are added.' },
} as const
