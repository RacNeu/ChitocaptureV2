export const reportModelLimitations = [
  'Capture results are simulation outputs and are not measured plant performance.',
  'Process Monitoring is not connected to live plant instrumentation.',
  'Assumed process inputs may differ from actual plant conditions.',
  'Literature for a related adsorbent does not by itself validate the active adsorbent.',
  'Simulated capture is not subtracted from organisational inventory without an explicit source mapping.',
] as const

export const reportMethodologyNotes = [
  'Organisational emissions use saved activity data multiplied by the compatible registered emission factor, with unit normalisation and GWP conversion only where applicable.',
  'Scope classification is taken from the activity record; scope is not inferred by the report.',
  'Only valid saved inventory records in the selected organisation, site, and reporting period are included.',
  'Historical trends use actual saved reporting periods only. No values are interpolated or generated to fill gaps.',
] as const
