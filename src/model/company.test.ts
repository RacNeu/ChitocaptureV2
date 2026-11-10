import { beforeEach, describe, expect, it, vi } from 'vitest'

let store: typeof import('./store')
beforeEach(async () => {
  vi.resetModules()
  store = await import('./store')
})

describe('company with several sites', () => {
  it('starts with the steel mill, head office & R&D lab and a separate cement plant', () => {
    const company = store.getCompany()
    expect(company.name).toBe('Malaysia Steel Demo Sdn Bhd')
    expect(company.sites.map((site) => site.state.settings.industryId)).toEqual(['steel', 'office', 'cement'])
    expect(company.sites.every((site) => site.state.onboarded)).toBe(true)
    // The kiln lives only on the cement site.
    const kilns = company.sites.filter((site) => site.state.machines.some((machine) => machine.kind === 'kiln'))
    expect(kilns.map((site) => site.state.settings.industryId)).toEqual(['cement'])
  })

  it('applies edits to the active site only and switches between sites', () => {
    const [steel, office] = store.getCompany().sites
    store.actions.updateSettings({ factoryName: 'Renamed mill' })
    expect(store.getCompany().sites[0].state.settings.factoryName).toBe('Renamed mill')
    store.companyActions.switchSite(office.id)
    expect(store.getState().settings.industryId).toBe('office')
    store.actions.updateSettings({ targetReductionPct: 50 })
    expect(store.getCompany().sites.find((site) => site.id === steel.id)!.state.settings.targetReductionPct).toBe(25)
  })

  it('adds a site that needs setting up, and removes it again', () => {
    const id = store.companyActions.addSite('palm-oil')
    expect(store.getState().onboarded).toBe(false)
    expect(store.getCompany().activeId).toBe(id)
    store.companyActions.removeSite(id)
    expect(store.getCompany().sites).toHaveLength(3)
    expect(store.getCompany().sites.some((site) => site.id === id)).toBe(false)
  })

  it('shares a measured sorbent capacity across every site', () => {
    store.actions.setMeasuredSorbentCapacity(2.2)
    expect(store.getCompany().sites.every((site) => site.state.measuredSorbentCapacity === 2.2)).toBe(true)
  })
})
