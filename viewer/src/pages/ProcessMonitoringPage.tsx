import { useEffect, useState, useSyncExternalStore } from 'react'
import AdsorbentStatus from '../components/AdsorbentStatus'
import Header from '../components/Header'
import PlantViewer from '../components/PlantViewer'
import SimulationNotice from '../components/SimulationNotice'
import { getModelLimitNote, simulationAssumptions } from '../data/assumptions'
import { getParameterRevision, subscribeToParameters, withParameterOverrides } from '../data/parameters'
import { advanceProcessState, createInitialProcessState } from '../simulation/processEngine'
import { getActiveScenarioResult, subscribeToActiveScenario } from '../simulation/activeScenario'
import type { ParameterValue } from '../types/parameters'
import type { ProcessState } from '../types/process'
import { formatMalaysiaDateTime } from '../utils/malaysiaTime'

function formatSimulatedTimestamp(timestamp: string): string {
  return `${formatMalaysiaDateTime(timestamp, true)} MYT`
}

function DevelopmentPanel({ state }: { state: ProcessState }) {
  const values = [
    ['Current phase', state.phase],
    ['Simulation time', new Date(state.timestamp).toISOString()],
    ['CO₂ input', `${state.carbon.co2Input.toFixed(2)} kg`],
    ['CO₂ captured', `${state.carbon.co2Captured.toFixed(2)} kg`],
    ['CO₂ remaining', `${state.carbon.co2Remaining.toFixed(2)} kg`],
    ['Capture efficiency', `${state.carbon.captureEfficiency.toFixed(2)}%`],
    ['Adsorbent loading', `${state.adsorbent.loadingPercentage.toFixed(2)}% (${state.adsorbent.currentLoading.toFixed(3)} mmol/g)`],
    ['Cycle count', state.adsorbent.cycleCount],
    ['Regeneration temperature', `${state.adsorbent.currentRegenerationTemperature.toFixed(1)} °C`],
    ['Energy consumed', `${state.energy.totalEnergy.toFixed(3)} kWh`],
    ['Energy per tonne captured', `${state.energy.energyPerTonneCO2.toFixed(2)} kWh/t`],
  ] as const
  return (
    <details className="debug-panel">
      <summary>Development · simulation state</summary>
      <div className="debug-grid">{values.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <p>{getModelLimitNote()}</p>
    </details>
  )
}

function ProcessMonitoringPage() {
  const parameterRevision = useSyncExternalStore(subscribeToParameters, getParameterRevision, getParameterRevision)
  const activeScenario = useSyncExternalStore(subscribeToActiveScenario, getActiveScenarioResult, getActiveScenarioResult)
  const scenarioOverrides: Record<string, ParameterValue> = Object.fromEntries(activeScenario?.snapshot.inputs?.map((input) => [input.parameterId, input.value]) ?? [])
  const makeState = () => activeScenario ? withParameterOverrides(scenarioOverrides, createInitialProcessState) : createInitialProcessState()
  const [state, setState] = useState<ProcessState>(makeState)
  const simulatedSecondsPerUpdate = simulationAssumptions.simulatedSecondsPerUpdate
  const updateIntervalMilliseconds = simulationAssumptions.updateIntervalMilliseconds

  useEffect(() => {
    setState(makeState())
    // A newly saved registry value or scenario starts the monitoring view from those inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScenario?.snapshot.scenarioId, parameterRevision])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setState((current) => activeScenario
        ? withParameterOverrides(scenarioOverrides, () => advanceProcessState(current, simulatedSecondsPerUpdate))
        : advanceProcessState(current, simulatedSecondsPerUpdate))
    }, updateIntervalMilliseconds)
    return () => window.clearInterval(timer)
  }, [simulatedSecondsPerUpdate, updateIntervalMilliseconds, activeScenario?.snapshot.scenarioId, parameterRevision])

  return (
    <div className="dashboard-shell" id="process-monitoring">
      <Header page="monitoring" timestamp={formatSimulatedTimestamp(state.timestamp)} />
      <main className="dashboard-main">
        <div className="dashboard-grid">
          <PlantViewer
            state={state}
            scenario={`${state.scenario.industrialSource.toUpperCase()} · ${state.scenario.emissionSource} · ${state.adsorbent.material}`}
          />
          <AdsorbentStatus status={state} />
        </div>
        <SimulationNotice />
        <DevelopmentPanel state={state} />
      </main>
      <footer className="app-footer"><span>CHITOCAPTURE <b>·</b> PROCESS MONITORING</span><span>PROTOTYPE INTERFACE <i /></span></footer>
    </div>
  )
}

export default ProcessMonitoringPage
