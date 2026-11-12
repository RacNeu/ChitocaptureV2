import { useEffect, useRef, useState } from 'react'
import { askAI, aiStatus, type AiMessage } from '../model/aiClient'
import { contextForAI, reply, type SuggestedAction } from '../model/assistant'
import { actions, getCompany, getState, useCompany, useFactory } from '../model/store'

type Entry = { id: number; from: 'user' | 'bot'; lines: string[]; source?: 'built-in' | 'ai'; actions?: SuggestedAction[] }

const starters = ['Which process should we cut first?', 'How do we save RM 2 million a year?', 'Cut emissions by 30%', 'What if we shut the ladle furnace?', 'Carbon cost at RM 80 per tonne?']

let nextId = 1

export default function ChatAssistant() {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<Entry[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const state = useFactory()
  const company = useCompany()
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // A new site starts a new conversation: the answers depend on the site's numbers.
  useEffect(() => { setEntries([]); setAdded(new Set()) }, [company.activeId])
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [entries, busy])
  useEffect(() => { if (open) inputRef.current?.focus() }, [open])

  const ask = async (question: string) => {
    const q = question.trim()
    if (!q || busy) return
    setText('')
    const userEntry: Entry = { id: nextId++, from: 'user', lines: [q] }
    setEntries((list) => [...list, userEntry])
    const local = reply(q, getState())
    if (local.understood) {
      setEntries((list) => [...list, { id: nextId++, from: 'bot', lines: local.lines, actions: local.actions, source: 'built-in' }])
      return
    }
    // Open questions go to the real AI when it is set up; otherwise the built-in help answers.
    setBusy(true)
    const history: AiMessage[] = [...entries, userEntry].slice(-12).map((entry) => ({ role: entry.from === 'user' ? 'user' : 'assistant', content: entry.lines.join('\n') }))
    const ai = await askAI(history, contextForAI(getState(), getCompany().name))
    setBusy(false)
    setEntries((list) => [...list, ai ? { id: nextId++, from: 'bot', lines: ai.split('\n').filter((line) => line.trim()), source: 'ai' } : { id: nextId++, from: 'bot', lines: local.lines }])
  }

  const addToPlan = (action: SuggestedAction) => {
    actions.addToPlan(action.machineId, action.measureId, state.settings.baselineYear + 1)
    setAdded((set) => new Set(set).add(`${action.machineId}:${action.measureId}`))
  }
  const inPlan = (action: SuggestedAction) => added.has(`${action.machineId}:${action.measureId}`) || state.plan.some((item) => item.machineId === action.machineId && item.measureId === action.measureId)

  return <>
    <button type="button" className={`chat-fab ${open ? 'open' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="chat-panel" title="Ask the ChitoCapture assistant">
      {open ? '✕' : <><span aria-hidden="true">✦</span><span className="chat-fab-label">Ask AI</span></>}
    </button>
    {open && <section id="chat-panel" className="chat-panel" role="dialog" aria-label="ChitoCapture assistant">
      <header className="chat-head">
        <div><strong>ChitoCapture assistant</strong><small>{state.settings.factoryName} · {aiStatus() === 'on' ? 'AI on' : 'built-in answers'}</small></div>
        {entries.length > 0 && <button type="button" className="link" onClick={() => setEntries([])}>Clear</button>}
      </header>
      <div className="chat-list" ref={listRef} aria-live="polite">
        {entries.length === 0 && <div className="chat-empty">
          <p>Ask where your carbon comes from, what to cut, or how to hit a cost or CO₂ goal. Answers use this site’s numbers.</p>
          <div className="chat-chips">{starters.map((starter) => <button key={starter} type="button" onClick={() => void ask(starter)}>{starter}</button>)}</div>
        </div>}
        {entries.map((entry) => <div key={entry.id} className={`chat-msg ${entry.from}`}>
          {entry.lines.map((line, index) => <p key={index} className={line.startsWith('•') || /^\d+\./.test(line) ? 'li' : ''}>{line}</p>)}
          {entry.actions && entry.actions.length > 0 && <div className="chat-actions">
            {entry.actions.map((action) => <button key={`${action.machineId}:${action.measureId}`} type="button" disabled={inPlan(action)} onClick={() => addToPlan(action)}>{inPlan(action) ? '✓ In plan' : `+ Plan: ${action.label}`}</button>)}
          </div>}
          {entry.source && <span className="chat-src">{entry.source === 'ai' ? 'AI answer · check before acting' : 'Calculated from your site data'}</span>}
        </div>)}
        {busy && <div className="chat-msg bot typing"><i /><i /><i /></div>}
      </div>
      <form className="chat-input" onSubmit={(event) => { event.preventDefault(); void ask(text) }}>
        <input ref={inputRef} value={text} onChange={(event) => setText(event.target.value)} placeholder="e.g. save RM 1m without stopping production" aria-label="Your question" />
        <button type="submit" className="btn small" disabled={!text.trim() || busy}>Send</button>
      </form>
    </section>}
  </>
}
