import { beforeEach, describe, expect, it, vi } from 'vitest'

let store: typeof import('./store')
beforeEach(async () => {
  vi.resetModules()
  store = await import('./store')
})

describe('company with several sites', () => {
  it('starts with the steel group only', () => {
    const company = store.getCompany()
    expect(company.name).toBe('Malaysia Steel Demo Sdn Bhd')
    expect(company.sites.map((site) => site.state.settings.industryId)).toEqual(['steel', 'steel-downstream', 'office'])
    expect(company.sites.every((site) => site.state.onboarded)).toBe(true)
    expect(store.getWorkspace().companies).toHaveLength(1)
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
    const id = store.companyActions.addSite('steel')
    expect(store.getState().onboarded).toBe(false)
    expect(store.getCompany().activeId).toBe(id)
    store.companyActions.removeSite(id)
    expect(store.getCompany().sites).toHaveLength(3)
    expect(store.getCompany().sites.some((site) => site.id === id)).toBe(false)
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
    const added = s.companyActions.addSite('steel-downstream')
    expect(s.getCompany().sites.find((site) => site.id === added)!.fixed).toBe(false)
    s.companyActions.removeSite(added)
    expect(s.getCompany().sites).toHaveLength(3)
  })
})

describe('adding companies', () => {
  it('adds up to three companies, each with un-set-up sites, and deletes only added ones', async () => {
    vi.resetModules()
    const s = await import('./store')
    for (let k = 0; k < 3; k += 1) expect(s.companyActions.addCompany(`Co ${k}`, [{ industryId: 'steel', name: 'Plant' }])).toBeTruthy()
    expect(s.companyActions.addCompany('Too many', [{ industryId: 'steel', name: 'Plant' }])).toBeNull()
    expect(s.getWorkspace().companies).toHaveLength(4)
    expect(s.getState().onboarded).toBe(false)
    const sample = s.getWorkspace().companies[0]
    s.companyActions.removeCompany(sample.id)
    expect(s.getWorkspace().companies).toHaveLength(4)
    s.companyActions.removeCompany(s.getCompany().id)
    expect(s.getWorkspace().companies).toHaveLength(3)
  })
})
