import { beforeEach, describe, expect, it, vi } from 'vitest'

let store: typeof import('./store')
beforeEach(async () => {
  vi.resetModules()
  store = await import('./store')
})

describe('company with several sites', () => {
  it('starts with a steel group and a separate cement producer', () => {
    const company = store.getCompany()
    expect(company.name).toBe('Malaysia Steel Demo Sdn Bhd')
    expect(company.sites.map((site) => site.state.settings.industryId)).toEqual(['steel', 'steel-downstream', 'office'])
    expect(company.sites.every((site) => site.state.onboarded)).toBe(true)
    // The steel group has no kiln; cement is a different demo customer.
    expect(company.sites.some((site) => site.state.machines.some((machine) => machine.kind === 'kiln'))).toBe(false)
    const companies = store.getWorkspace().companies
    expect(companies).toHaveLength(2)
    expect(companies[1].sites.map((site) => site.state.settings.industryId)).toEqual(['cement'])
  })

  it('switches between demo companies and keeps each one’s sites separate', () => {
    const cement = store.getWorkspace().companies[1]
    store.companyActions.switchCompany(cement.id)
    expect(store.getCompany().name).toBe('Malaysia Cement Demo Sdn Bhd')
    expect(store.getState().settings.industryId).toBe('cement')
    store.companyActions.switchSite(store.getWorkspace().companies[0].sites[0].id)
    expect(store.getCompany().name).toBe('Malaysia Steel Demo Sdn Bhd')
  })

  it('applies edits to the active site only and switches between sites', () => {
    const [steel, office] = store.getCompany().sites
    store.actions.updateSettings({ factoryName: 'Renamed mill' })
    expect(store.getCompany().sites[0].state.settings.factoryName).toBe('Renamed mill')
    store.companyActions.switchSite(office.id)
    expect(store.getState().settings.industryId).toBe('steel-downstream')
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
    expect(store.getWorkspace().companies.every((item) => item.sites.every((site) => site.state.measuredSorbentCapacity === 2.2))).toBe(true)
  })
})

describe('fixed sample sites and added sites', () => {
  it('protects the sample sites but lets users delete sites they added', async () => {
    vi.resetModules()
    const s = await import('./store')
    const sample = s.getCompany().sites[1]
    expect(sample.fixed).toBe(true)
    s.companyActions.removeSite(sample.id)
    expect(s.getCompany().sites).toHaveLength(3)
    const added = s.companyActions.addSite('food')
    expect(s.getCompany().sites.find((site) => site.id === added)!.fixed).toBe(false)
    s.companyActions.removeSite(added)
    expect(s.getCompany().sites).toHaveLength(3)
  })
})
