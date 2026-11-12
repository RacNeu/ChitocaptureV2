import { useState } from 'react'
import BrandLogo from '../components/BrandLogo'
import { demoAccounts, signIn } from '../model/auth'

export default function Login({ onSignedIn }: { onSignedIn: (company: string | null) => void }) {
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showDemo, setShowDemo] = useState(false)

  const submit = async (accountId = id, secret = password) => {
    if (!accountId.trim() || !secret) { setError('Enter your company ID and password.'); return }
    setBusy(true)
    setError('')
    const session = await signIn(accountId, secret)
    setBusy(false)
    if (!session) { setError('That company ID or password is not right.'); return }
    onSignedIn(session.company)
  }

  return <div className="login">
    <div className="login-art" aria-hidden="true">
      <div className="login-orb a" /><div className="login-orb b" />
      <div className="login-pitch">
        <BrandLogo size={72} />
        <h2>Track every tonne.<br />Cut what matters.</h2>
        <p>Carbon tracking, process simulation and verified reduction plans for Malaysian factories.</p>
        <ul><li>CBAM, carbon tax and EECA ready</li><li>Engineers, sustainability and management in one plan</li><li>Every factor sourced</li></ul>
      </div>
    </div>
    <main className="login-main">
      <form className="login-card" onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <div className="login-brand"><BrandLogo size={44} /><div><strong>ChitoCapture</strong><small>Company sign-in</small></div></div>
        <label>Company ID
          <input value={id} onChange={(event) => setId(event.target.value)} placeholder="e.g. MSD-001" autoComplete="username" autoCapitalize="characters" spellCheck={false} />
        </label>
        <label>Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
        </label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button type="submit" className="btn login-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="login-note">Each subscribing company gets its own ID and password and sees only its own sites.</p>

        <button type="button" className="link login-demo-toggle" onClick={() => setShowDemo(!showDemo)} aria-expanded={showDemo}>{showDemo ? 'Hide demo accounts' : 'Demo accounts for judges & testers'}</button>
        {showDemo && <div className="login-demo">
          {demoAccounts.map((account) => <button key={account.id} type="button" onClick={() => { setId(account.id); setPassword(account.hint); void submit(account.id, account.hint) }}>
            <strong>{account.id}</strong><span>{account.company ?? 'All demo companies'}</span><code>{account.hint}</code>
          </button>)}
          <small>Prototype sign-in: accounts are built into the app and data stay in this browser. Real accounts would use a secure server.</small>
        </div>}
      </form>
    </main>
  </div>
}
