import { describe, expect, it } from 'vitest'
import { freshState } from './store'
import { plannedActions, contextFor } from './calc'
import { steelScenario, galvScenario } from './scenario'
import { noUpgrades, upgradeImpacts, upgradeInfo, type Upgrades } from './steel'
import { galvUpgradeImpacts, galvUpgradeInfo, noGalvUpgrades, type GalvUpgrades } from './galv'
import { galvFromSite, steelFromSite } from './siteLink'
import type { FactoryState, PlanAction } from './types'

const asPlan = (state: FactoryState, items: { machineId: string; measureId: string; scale?: number }[]): FactoryState =>
  ({ ...state, plan: items.map((item, k): PlanAction => ({ id: `a${k}`, startYear: 2027, status: 'proposed', ...item })) })

describe('sandbox scenario → plan', () => {
  const mill = { ...freshState('steel'), onboarded: true }
  const ctx = contextFor(mill)
  const params = { ...steelFromSite(mill).params, gridKgPerKWh: ctx.gridKgPerKWh, electricityRMPerMWh: mill.settings.electricityPriceRMPerMWh, gasRMPerGJ: mill.settings.fuelPriceRMPerGJ['natural-gas'] }

  for (const info of upgradeInfo) {
    it(`steel: “${info.name}” saves the same in the plan as in the sandbox`, () => {
      const value = info.key === 'greenShare' ? 0.4 : info.key === 'captureShare' ? 0.5 : true
      const u = { ...noUpgrades, [info.key]: value } as Upgrades
      const sandbox = upgradeImpacts(params, u)[0]
      const items = steelScenario(mill, u)
      expect(items.length).toBeGreaterThan(0)
      const plan = plannedActions(asPlan(mill, items))
      const planT = plan.reduce((sum, item) => sum + item.economics.netT, 0)
      const planCapex = plan.reduce((sum, item) => sum + item.economics.capexRM, 0)
      expect(planT / sandbox.savedTPerYear).toBeCloseTo(1, 2)
      if (sandbox.capexRM) expect(planCapex / sandbox.capexRM).toBeCloseTo(1, 2)
    })
  }

  const wire = { ...freshState('steel-downstream'), onboarded: true }
  const wctx = contextFor(wire)
  const gp = { ...galvFromSite(wire).params, gridKgPerKWh: wctx.gridKgPerKWh }
  for (const info of galvUpgradeInfo) {
    it(`wire plant: “${info.name}” saves the same in the plan as in the sandbox`, () => {
      const u = { ...noGalvUpgrades, [info.key]: info.key === 'greenShare' ? 0.4 : true } as GalvUpgrades
      const sandbox = galvUpgradeImpacts(gp, u)[0]
      const plan = plannedActions(asPlan(wire, galvScenario(wire, u)))
      const planT = plan.reduce((sum, item) => sum + item.economics.netT, 0)
      expect(planT / sandbox.savedTPerYear).toBeCloseTo(1, 2)
    })
  }

  it('adds nothing when no upgrade is on', () => {
    expect(steelScenario(mill, { ...noUpgrades, captureShare: 0 })).toHaveLength(0)
    expect(galvScenario(wire, noGalvUpgrades)).toHaveLength(0)
  })
})
