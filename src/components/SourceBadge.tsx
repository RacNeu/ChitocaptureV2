import { matchStatus, streamLabel, unitOf } from '../model/calibration'
import { monthLabel } from '../model/history'
import { actions, useFactory } from '../model/store'
import Info from './Info'

/** Says where the machine-based figures on this page come from: your bills, or the template. */
export default function SourceBadge({ onUpload }: { onUpload: () => void }) {
  const state = useFactory()
  const status = matchStatus(state.machines, state.monthly ?? [])
  const cal = state.calibration

  if (status.state === 'template') return <div className="source-badge template">
    <b>Template figures</b> · a typical mill, not yours. <button type="button" className="link" onClick={onUpload}>Upload bills</button> to make this your plant.
  </div>

  if (status.state === 'drifted') return <div className="source-badge drifted">
    <b>Machine figures differ from your bills by {Math.round(status.worstPct)}%</b> · a machine was edited. <button type="button" className="link" onClick={() => actions.rematch()}>Match to bills</button>
  </div>

  return <div className="source-badge matched">
    <b>✓ Matched to your bills</b> · {monthLabel(status.from)} – {monthLabel(status.to)}
    {cal && <Info label="How the match works">
      Each machine’s energy is scaled so the totals equal a year of your bills. Metered machines keep their own figures.
      {cal.streams.map((s) => <span key={s.stream} className="info-line">{streamLabel(s.stream)}: {Math.round(s.billTotal).toLocaleString('en-MY')} {unitOf(s.stream)}/yr{s.added ? ' · new “from bills” line' : s.factor !== null ? ` · machines ×${s.factor.toFixed(2)}` : ''}{s.meteredOver ? ' · metered machines exceed the bills: check' : ''}</span>)}
    </Info>}
  </div>
}
