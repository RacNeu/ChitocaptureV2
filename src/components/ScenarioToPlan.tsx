import { useState } from 'react'
import { can, roleById } from '../model/roles'
import type { ScenarioItem } from '../model/scenario'
import { actions, useRole } from '../model/store'

/** Footer under a what-if sandbox: add the switched-on upgrades to the site's plan. */
export default function ScenarioToPlan({ items, label }: { items: ScenarioItem[]; label: string }) {
  const role = useRole()
  const [result, setResult] = useState<{ added: number; updated: number } | null>(null)
  const allowed = can.propose(role)
  return <div className="scenario-to-plan">
    <div>
      <strong>Turn this scenario into a plan</strong>
      <small className="muted">{items.length === 0
        ? 'Switch on at least one upgrade first.'
        : `${items.length} action${items.length === 1 ? '' : 's'}: ${[...new Set(items.map((item) => item.label.split(' · ')[0]))].join(', ')}. Each is added as “Proposed”, with the same savings and costs as shown here.`}</small>
      {result && <small className="scenario-done">✓ {result.added} added{result.updated ? `, ${result.updated} updated` : ''} · <a href="#plan">Open the plan →</a></small>}
    </div>
    <button type="button" className="btn" disabled={!items.length || !allowed} title={allowed ? '' : `Viewing as ${roleById(role).label}: engineers and sustainability propose actions`}
      onClick={() => setResult(actions.addScenario(items, label))}>Add to plan</button>
  </div>
}
