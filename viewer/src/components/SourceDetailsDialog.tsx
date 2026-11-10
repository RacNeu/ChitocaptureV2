import { getAllParameters } from '../data/parameters'
import { getSource, sourceTypeLabel } from '../data/sources'
import type { ParameterSourceType } from '../types/parameters'

function StatusBadge({ type }: { type: ParameterSourceType }) {
  return <span className={`data-status ${type}`}>{sourceTypeLabel(type)}</span>
}

function SourceDetailsDialog({ sourceId, onClose }: { sourceId: string; onClose: () => void }) {
  const source = getSource(sourceId)
  if (!source) return null
  const sourceParameters = getAllParameters().filter((parameter) => parameter.sourceId === sourceId)
  const valueText = (value: string | number) => typeof value === 'number' ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value) : value

  return (
    <div className="source-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="source-detail-panel" role="dialog" aria-modal="true" aria-labelledby="source-detail-title">
        <div className="source-detail-heading"><div><span className="section-eyebrow">SOURCE RECORD · {source.sourceId}</span><h2 id="source-detail-title">{source.title}</h2></div><button type="button" className="source-detail-close" aria-label="Close source details" onClick={onClose}>×</button></div>
        {source.title === 'SOURCE TO BE VERIFIED' && <div className="unverified-banner">SOURCE TO BE VERIFIED</div>}
        <dl className="source-detail-meta"><dt>Type</dt><dd><StatusBadge type={source.sourceType} /></dd><dt>Author / Publisher</dt><dd>{source.publisher}</dd><dt>Year</dt><dd>{source.year ?? 'Not supplied'}</dd><dt>Reference</dt><dd>{source.reference}</dd><dt>URL</dt><dd>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.url}</a> : 'Not available'}</dd></dl>
        <h3>Parameters using this source</h3><ul className="source-parameter-list">{sourceParameters.map((parameter) => <li key={parameter.id}>{parameter.name}<span>{valueText(parameter.value)} {parameter.unit}</span></li>)}</ul>
        <h3>Notes</h3><p className="source-notes">{source.notes}</p>
        <button type="button" className="source-detail-done" onClick={onClose}>Done</button>
      </section>
    </div>
  )
}

export default SourceDetailsDialog
