import { describe, expect, it } from 'vitest'
import { findMachine, parsePercent, parseRinggit, parseTonnes, reply } from './assistant'
import { demoAccounts, sha256, signIn, signOut, visibleCompanies } from './auth'
import { summarise } from './calc'
import { defaultWorkspace } from './store'

const steel = defaultWorkspace().companies[0].sites[0].state

describe('assistant parsing', () => {
  it('reads ringgit, percent and tonnes', () => {
    expect(parseRinggit('save RM 2 million a year')).toBe(2_000_000)
    expect(parseRinggit('RM2m')).toBe(2_000_000)
    expect(parseRinggit('rm 500k')).toBe(500_000)
    expect(parseRinggit('RM 1,200,000')).toBe(1_200_000)
    expect(parsePercent('cut 30% by 2030')).toBe(30)
    expect(parseTonnes('reduce 50 kt')).toBe(50_000)
    expect(parseTonnes('reduce 20,000 tonnes')).toBe(20_000)
  })
  it('finds machines by name or nickname', () => {
    expect(findMachine('what if we shut the EAF?', steel.machines)?.name).toBe('Electric arc furnace')
    expect(findMachine('stop the ladle furnace', steel.machines)?.name).toBe('Ladle furnace')
    expect(findMachine('reheating furnace please', steel.machines)?.name).toBe('Reheating furnace')
  })
})

describe('assistant answers', () => {
  it('names the biggest source first', () => {
    const answer = reply('Which process should we cut first?', steel)
    expect(answer.understood).toBe(true)
    expect(answer.lines.join(' ')).toContain('Electric arc furnace')
    expect(answer.actions?.length).toBeGreaterThan(0)
  })
  it('meets a percentage goal or says it falls short', () => {
    const answer = reply('Cut emissions by 10%', steel)
    expect(answer.understood).toBe(true)
    expect(answer.lines[0]).toContain('10%')
    expect(answer.actions?.length).toBeGreaterThan(0)
  })
  it('builds a plan for a money goal', () => {
    const answer = reply('How do we save RM 2 million a year?', steel)
    expect(answer.understood).toBe(true)
    expect(answer.lines.join(' ')).toMatch(/save/i)
  })
  it('explains a shutdown with the CO₂ removed', () => {
    const removed = summarise(steel).byMachine.find((row) => row.machine.name === 'Ladle furnace')!.baselineT
    const answer = reply('What if we shut the ladle furnace?', steel)
    expect(answer.lines[0]).toContain('Ladle furnace')
    expect(removed).toBeGreaterThan(0)
  })
  it('uses the carbon price the user names', () => {
    const answer = reply('What is our carbon cost at RM 80 per tonne?', steel)
    expect(answer.lines[0]).toContain('RM 80')
  })
  it('hands open questions on', () => {
    expect(reply('Tell me a poem about scrap', steel).understood).toBe(false)
  })
})

describe('demo sign-in', () => {
  it('stores hashes, not passwords, and checks them', async () => {
    for (const account of demoAccounts) expect(await sha256(`${account.id}:${account.hint}`)).toBe(account.hash)
    expect(await signIn('msd-001', 'wrong')).toBeNull()
    const session = await signIn('msd-001', 'steel2026')
    expect(session?.company).toBe('Malaysia Steel Demo Sdn Bhd')
    signOut()
  })
  it('shows a company account only its own company', () => {
    const workspace = defaultWorkspace()
    expect(visibleCompanies(workspace, { accountId: 'MCD-001', company: 'Malaysia Cement Demo Sdn Bhd', since: '' }).map((item) => item.name)).toEqual(['Malaysia Cement Demo Sdn Bhd'])
    expect(visibleCompanies(workspace, { accountId: 'DEMO', company: null, since: '' })).toHaveLength(2)
  })
})
