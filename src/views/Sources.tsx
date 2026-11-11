import { sources } from '../model/sources'

export default function Sources() {
  return <div className="sources-page">
    <header className="plan-head"><div><span className="eyebrow">Data & sources</span><h1>Where the numbers come from</h1>
      <p className="muted">Default factors and benchmarks with their published sources. Anything without a source is labelled illustrative. Every value can be changed in Settings for a real site.</p></div></header>
    <div className="table-wrap card"><table className="grid-table sources-table">
      <thead><tr><th>Topic</th><th>Value</th><th>Used for</th><th>Source</th></tr></thead>
      <tbody>{sources.map((item) => <tr key={item.id} className={item.id === 'illustrative' ? 'illustrative' : ''}>
        <td><b>{item.topic}</b></td><td>{item.value}{item.note && <small>{item.note}</small>}</td><td className="muted">{item.used}</td>
        <td>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.source} ↗</a> : item.source}</td>
      </tr>)}</tbody>
    </table></div>
  </div>
}
