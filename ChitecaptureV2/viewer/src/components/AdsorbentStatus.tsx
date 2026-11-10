import type { ProcessState } from '../types/process'

type AdsorbentStatusProps = { status: ProcessState }

function StatusValue({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <div className="status-value"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safe / 3_600)
  const minutes = Math.floor((safe % 3_600) / 60)
  const remainder = safe % 60
  return [hours, minutes, remainder].map((part) => String(part).padStart(2, '0')).join(':')
}

function AdsorbentStatus({ status }: AdsorbentStatusProps) {
  const phaseLabel = status.phase === 'adsorption' ? 'Adsorption' : 'Regeneration'
  const firstCycleDate = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(status.adsorbent.firstCycleDate))
  return (
    <section className="panel adsorbent-panel" aria-labelledby="adsorbent-title">
      <div className="status-heading">
        <div>
          <span className="section-eyebrow">ADSORBER · UNIT A-101</span>
          <h2 id="adsorbent-title">Adsorbent status</h2>
        </div>
        <span className={`phase-pill ${status.phase}`}><i />{phaseLabel}</span>
      </div>
      <div className="adsorbent-content">
        <div className="loading-indicator" style={{ '--loading': `${status.adsorbent.loadingPercentage}%` } as React.CSSProperties} role="img" aria-label={`Adsorbent loading ${status.adsorbent.loadingPercentage.toFixed(1)}%`}>
          <div><strong>{Math.round(status.adsorbent.loadingPercentage)}<small>%</small></strong><span>LOADED</span></div>
        </div>
        <div className="status-divider" />
        <div className="status-grid">
          <StatusValue label="Capture efficiency" value={`${status.carbon.captureEfficiency.toFixed(1)}%`} note="Cumulative carbon balance" />
          <StatusValue label="Time elapsed" value={formatDuration(status.adsorbent.adsorptionElapsed)} note="Current adsorption cycle" />
          <StatusValue label="To regeneration" value={formatDuration(status.adsorbent.estimatedTimeToRegeneration)} note="Capacity-limited estimate" />
          <StatusValue label="Adsorbent loading" value={`${status.adsorbent.currentLoading.toFixed(2)} mmol/g`} note={`of ${status.adsorbent.capacity.toFixed(1)} mmol/g capacity`} />
          <StatusValue label="Operating limit" value={`${status.adsorbent.operatingLimit}%`} note="Bed loading limit" />
          <StatusValue label="Cycle count" value={status.adsorbent.cycleCount} />
          <StatusValue label="First cycle" value={firstCycleDate} />
        </div>
      </div>
    </section>
  )
}

export default AdsorbentStatus
