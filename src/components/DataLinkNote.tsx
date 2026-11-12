import { num } from '../format'
import type { Deviation } from '../model/siteLink'

/** Tells the user the simulation runs on their own machine data, and where it differs from the sample. */
export default function DataLinkNote({ linked, deviations }: { linked: boolean; deviations: Deviation[] }) {
  if (!linked) return <p className="data-link off">Running on sample figures: set annual production in Settings to link the simulation to your machine data.</p>
  return <p className="data-link">
    <i aria-hidden="true" />Linked to this site’s machine data
    {deviations.length > 0 && <>: {deviations.map((item) => <span key={item.name} className={item.pct > 0 ? 'up' : 'down'}>{item.name} {item.pct > 0 ? '+' : '−'}{num(Math.abs(item.pct))}%</span>)} vs the sample plant</>}
  </p>
}
