import { useSyncExternalStore } from 'react'
import type { Company, Workspace } from './store'

/**
 * Demo sign-in. Each subscribing company gets a company ID and password that opens only its own
 * company. This is NOT real security: the accounts live in the app itself and data stays in the
 * browser. A real deployment swaps this module for a server sign-in (for example Supabase Auth)
 * with each company's data stored separately; the rest of the app only uses getSession/useSession.
 */

export type Account = {
  id: string
  /** The company this account may open, by name. Null = the demo account that sees every company. */
  company: string | null
  /** SHA-256 of `ID:password`, so the passwords are not written in plain text in the code. */
  hash: string
  hint: string
}

export const demoAccounts: Account[] = [
  { id: 'MSD-001', company: 'Malaysia Steel Demo Sdn Bhd', hash: '2d60455356b2ec976e4c032e2ba0fd92d05ae6cb91a15ac386946a2bf253ae1a', hint: 'steel2026' },
  { id: 'MCD-001', company: 'Malaysia Cement Demo Sdn Bhd', hash: '752deae2a6b3c77de2c60a8caff271aab6b5533d6099d9a278df6bc890b73124', hint: 'cement2026' },
  { id: 'DEMO', company: null, hash: '45d714d715da1773eda563123432b14e65bd3219ab4541cbea51b89defb9e868', hint: 'demo2026' },
]

export type Session = { accountId: string; company: string | null; since: string }

const SESSION_KEY = 'chitocapture.session'
const listeners = new Set<() => void>()

function load(): Session | null {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(SESSION_KEY)
    const parsed = raw ? JSON.parse(raw) as Session : null
    return parsed && demoAccounts.some((account) => account.id === parsed.accountId) ? parsed : null
  } catch { return null }
}

let session: Session | null = load()

function set(next: Session | null) {
  session = next
  try {
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next))
    else localStorage.removeItem(SESSION_KEY)
  } catch { /* Private mode: keep the session in memory only. */ }
  listeners.forEach((listener) => listener())
}

export async function sha256(text: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Returns the session, or null when the ID or password is wrong. */
export async function signIn(id: string, password: string): Promise<Session | null> {
  const accountId = id.trim().toUpperCase()
  const account = demoAccounts.find((item) => item.id === accountId)
  if (!account || await sha256(`${accountId}:${password}`) !== account.hash) return null
  const next = { accountId, company: account.company, since: new Date().toISOString() }
  set(next)
  return next
}

export const signOut = () => set(null)
export const getSession = () => session
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const useSession = () => useSyncExternalStore(subscribe, getSession, getSession)

/** The companies this session may see. */
export function visibleCompanies(workspace: Workspace, current = session): Company[] {
  if (!current?.company) return workspace.companies
  return workspace.companies.filter((company) => company.name === current.company)
}

/** True when the account belongs to one company, so adding or switching companies is hidden. */
export const isCompanyAccount = (current = session) => Boolean(current?.company)
