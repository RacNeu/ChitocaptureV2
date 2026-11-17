import { describe, expect, it } from 'vitest'
import { IDLE_AVOIDABLE, siteFindings } from './findings'
import { DEFAULT_TARIFF, sampleInterval } from './interval'
import { sampleHistory } from './history'
import { freshState } from './store'

const base = { ...freshState('steel'), onboarded: true }
const mill = { ...base, monthly: sampleHistory(base, '2026-10'), interval: sampleInterval(base, '2026-11') }

describe('findings', () => {
  const view = siteFindings(mill)
  const load = view.load!
  it('turns the sample mill’s data into ranked findings with ringgit figures', () => {
    const kinds = view.findings.map((f) => f.kind)
    expect(kinds).toContain('peak')
    expect(kinds).toContain('idle')
    for (let k = 1; k < view.findings.length; k += 1) expect(view.findings[k - 1].rmPerMonth).toBeGreaterThanOrEqual(view.findings[k].rmPerMonth)
    expect(JSON.stringify(view.findings)).not.toMatch(/NaN|undefined|Infinity/)
  })
  it('prices peak demand at the demand charge and idle energy at the energy charge', () => {
    const peak = view.findings.find((f) => f.kind === 'peak')!
    const avg = load.months.reduce((s, m) => s + m.shave[1].kW, 0) / load.months.length
    expect(peak.rmPerMonth).toBeCloseTo(avg * DEFAULT_TARIFF.mdRMPerKW)
    const idle = view.findings.find((f) => f.kind === 'idle')!
    expect(idle.rmPerMonth).toBeCloseTo(load.idle.rm / (load.days / 30.4) * IDLE_AVOIDABLE)
  })
  it('keeps the team’s status for each finding', () => {
    const key = view.findings[0].key
    const withStatus = siteFindings({ ...mill, findings: { [key]: { status: 'assigned', owner: 'Aiman', updatedAt: '2026-11-17' } } })
    expect(withStatus.findings.find((f) => f.key === key)!.state.status).toBe('assigned')
    expect(view.findings[0].state.status).toBe('new')
  })
  it('invents nothing without data', () => {
    const empty = siteFindings(base)
    expect(empty.load).toBeNull()
    expect(empty.hasMonthly).toBe(false)
    expect(empty.findings).toHaveLength(0)
  })
  it('uses a custom tariff', () => {
    const dear = siteFindings({ ...mill, settings: { ...mill.settings, tariff: { mdRMPerKW: 2 * DEFAULT_TARIFF.mdRMPerKW, energyRMPerMWh: DEFAULT_TARIFF.energyRMPerMWh } } })
    expect(dear.findings.find((f) => f.kind === 'peak')!.rmPerMonth).toBeCloseTo(2 * view.findings.find((f) => f.kind === 'peak')!.rmPerMonth)
  })
})
