import { useEffect } from 'react'
import ProcessMonitoringPage from './pages/ProcessMonitoringPage'
import DataSourcesPage from './pages/DataSourcesPage'
import ScenarioAnalysisPage from './pages/ScenarioAnalysisPage'
import ExecutiveDashboardPage from './pages/ExecutiveDashboardPage'
import CarbonFlowPage from './pages/CarbonFlowPage'
import ReportsPage from './pages/ReportsPage'
import CarbonFootprintCalculatorPage from './pages/CarbonFootprintCalculatorPage'
import CarbonDashboardPage from './pages/CarbonDashboardPage'
import EmissionHotspotsPage from './pages/EmissionHotspotsPage'
import ActionHubPage from './pages/ActionHubPage'

function App() {
  const page = new URLSearchParams(window.location.search).get('page')
  useEffect(() => {
    const pageTitle = page === 'carbon-calculator' ? 'Carbon Footprint Calculator'
      : page === 'carbon-flow' ? 'Carbon Flow'
      : page === 'process-monitoring' ? 'Process Monitoring'
        : page === 'scenario-analysis' ? 'Scenario Analysis'
          : page === 'data-sources' ? 'Data & Sources'
            : page === 'reports' ? 'Reports'
              : page === 'executive-dashboard' ? 'Capture Summary'
                : page === 'emission-hotspots' ? 'Emission Hotspots'
                  : page === 'action-hub' ? 'Action Hub' : 'Carbon Dashboard'
    document.title = `ChitoCapture | ${pageTitle}`
  }, [page])
  if (page === 'action-hub') return <ActionHubPage />
  if (page === 'data-sources') return <DataSourcesPage />
  if (page === 'emission-hotspots') return <EmissionHotspotsPage />
  if (page === 'carbon-calculator') return <CarbonFootprintCalculatorPage />
  if (page === 'scenario-analysis') return <ScenarioAnalysisPage />
  if (page === 'process-monitoring') return <ProcessMonitoringPage />
  if (page === 'carbon-flow') return <CarbonFlowPage />
  if (page === 'reports') return <ReportsPage />
  if (page === 'executive-dashboard') return <ExecutiveDashboardPage />
  return <CarbonDashboardPage />
}

export default App
