import type { ProcessMetric, ProcessStream } from '../types/process'

const iconText: Record<ProcessMetric['icon'], string> = {
  co2: 'CO₂', flow: '⇢', temperature: '°', pressure: 'P', humidity: 'H₂O', sulfur: 'S', nitrogen: 'N', particles: 'PM',
}

type MetricPanelProps = { stream: ProcessStream }

function MetricPanel({ stream }: MetricPanelProps) {
  return (
    <section className={`panel metric-panel ${stream.direction}`} aria-labelledby={`${stream.direction}-title`}>
      <div className="panel-titlebar">
        <span className={`stream-mark ${stream.direction}`} aria-hidden="true">{stream.direction === 'inlet' ? 'IN' : 'OUT'}</span>
        <div className="panel-title-copy">
          <h2 id={`${stream.direction}-title`}>{stream.title}</h2>
          <p>{stream.subtitle}</p>
        </div>
        <span className="panel-kicker">PROCESS GAS</span>
      </div>
      <div className="metric-list">
        {stream.metrics.map((metric) => (
          <div className="metric-row" key={metric.label}>
            <span className={`metric-icon ${metric.icon}`} aria-hidden="true">{iconText[metric.icon]}</span>
            <span className="metric-label">{metric.label}</span>
            <strong className="metric-reading">{metric.value}<small>{metric.unit}</small></strong>
          </div>
        ))}
      </div>
    </section>
  )
}

export default MetricPanel
