import { useMemo, useState } from 'react'
import { gridFactor } from '../model/factors'
import {
  TEMPLATES, defaultMelt, deriveHeats, findAnomalies, importMeltRows, learnFactors, meltLosses,
  type MeltImport, type MeltSettings, type MeltShop as MeltData,
} from '../model/meltshop'
import { demoMeltShop } from '../model/meltshopDemo'
import { actions, useFactory } from '../model/store'
import PlantArt from '../components/PlantArt'
import { toast } from '../model/toast'
import MeltHmi from './MeltHmi'
import { MeltChemistry, MeltCarbon, MeltSimulator } from './MeltTabs'

export type Tab = 'hmi' | 'material' | 'carbon'
const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'hmi', label: 'Furnace HMI', icon: '🎛' },
  { id: 'material', label: 'Material & yield', icon: '⚗' },
  { id: 'carbon', label: 'Carbon & decarbonisation', icon: '🍃' },
]

async function readFile(file: File): Promise<MeltImport> {
  if (/\.(xlsx|xlsm)$/i.test(file.name)) {
    const { default: readXlsxFile } = await import('read-excel-file')
    const rows = await readXlsxFile(file)
    return importMeltRows(rows.map((row) => row.map((cell) => cell instanceof Date ? cell.toISOString().slice(0, 16).replace('T', ' ') : cell === null ? '' : String(cell))))
  }
  const text = (await file.text()).replace(/^﻿/, '')
  const first = text.split(/\r?\n/)[0] ?? ''
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : first.includes('\t') ? '\t' : ','
  return importMeltRows(text.split(/\r?\n/).map((line) => line.split(sep)))
}
export function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

let demoCache: MeltData | null = null
const demo = () => (demoCache ??= demoMeltShop())

/** Everything the five tabs share, derived once from uploads (or the demo) and this site's settings. */
export function useMelt() {
  const state = useFactory()
  const isDemo = !!state.meltshopDemo
  const data: MeltData | null = isDemo ? demo() : state.meltshop?.heats.length ? { ...state.meltshop } : null
  const s: MeltSettings = { ...defaultMelt, ...state.settings.melt, scrapRMPerT: { ...defaultMelt.scrapRMPerT, ...state.settings.melt?.scrapRMPerT } }
  const grid = gridFactor(state.settings.gridRegionId, state.settings.customGridKgPerKWh)
  const key = JSON.stringify(state.settings.melt ?? {})
  return useMemo(() => {
    if (!data) return null
    const heats = deriveHeats(data.heats, s, grid)
    const model = learnFactors(heats)
    return { data, heats, model, losses: meltLosses(heats, model, s, grid), anomalies: findAnomalies(data.readings), s, grid, isDemo, furnaces: [...new Set(heats.map((h) => h.furnace))].sort() }
  }, [data?.heats, data?.chem, data?.readings, key, grid, isDemo]) // eslint-disable-line react-hooks/exhaustive-deps
}
export type Melt = NonNullable<ReturnType<typeof useMelt>>

export default function MeltShop() {
  const melt = useMelt()
  const [tab, setTab] = useState<Tab>('hmi')
  const [msg, setMsg] = useState<MeltImport | null>(null)
  const [busy, setBusy] = useState(false)

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    for (const file of Array.from(files)) {
      try {
        const r = await readFile(file)
        setMsg(r)
        if (r.error) continue
        if (r.kind === 'heats') actions.setMeltShop({ heats: r.heats, source: file.name }, `Uploaded ${r.heats.length} melt-shop heats (${file.name})`)
        if (!r.error) toast(`Loaded ${r.kind === 'heats' ? `${r.heats.length} heats` : r.kind === 'chem' ? `${r.chem.length} spectrometer results` : `${r.readings.length} readings`} from ${file.name}`)
        if (r.kind === 'chem') actions.setMeltShop({ chem: r.chem }, `Uploaded ${r.chem.length} spectrometer results (${file.name})`)
        if (r.kind === 'readings') actions.setMeltShop({ readings: r.readings }, `Uploaded ${r.readings.length} furnace readings (${file.name})`)
      } catch (err) { setMsg({ kind: 'heats', heats: [], chem: [], readings: [], warnings: [], error: `Could not read ${file.name}: ${(err as Error).message}` }) }
    }
    setBusy(false)
  }
  const uploader = <label className="btn">{busy ? 'Reading…' : '⬆ Upload files'}<input type="file" multiple accept=".csv,.txt,.xlsx,.xlsm" hidden onChange={(e) => { void upload(e.target.files); e.target.value = '' }} /></label>
  const templates = <details className="ms-templates"><summary className="btn ghost">Templates</summary><div>
    <button type="button" className="link" onClick={() => download('meltshop-heats-template.csv', TEMPLATES.heats)}>Heat log</button>
    <button type="button" className="link" onClick={() => download('meltshop-spectrometer-template.csv', TEMPLATES.chem)}>Spectrometer</button>
    <button type="button" className="link" onClick={() => download('meltshop-readings-template.csv', TEMPLATES.readings)}>Live readings</button>
  </div></details>

  if (!melt) return <div className="ms">
    <section className="ms-hero">
      <PlantArt variant="hero" />
      <span className="eyebrow">Melt shop</span>
      <h1>Induction furnace intelligence</h1>
      <p>Upload your furnace heat log, spectrometer results and live readings. The app learns your furnaces’ own energy factors and shows where money and carbon are lost.</p>
      <div className="row-actions center">{uploader}{templates}<button type="button" className="btn ghost" onClick={() => actions.setMeltShopDemo(true)}>▶ Open demo melt shop</button></div>
      {msg && <ImportMsg msg={msg} />}
    </section>
  </div>

  return <div className="ms">
    {melt.isDemo && <div className="ms-demo" role="note"><b>DEMO DATA</b><span>Illustrative melt shop sized like Masteel (4 × 60 t induction furnaces + ladle furnace). Not a real plant.</span><button type="button" className="btn small ghost" onClick={() => actions.setMeltShopDemo(false)}>Close demo</button></div>}
    <header className="ms-head">
      <div><span className="eyebrow">Melt shop · {melt.data.source}</span><h1>{tabs.find((t) => t.id === tab)!.label}</h1></div>
      <div className="row-actions">{uploader}{templates}</div>
    </header>
    {msg && <ImportMsg msg={msg} />}
    <nav className="ms-tabs" role="tablist">{tabs.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}><span aria-hidden="true">{t.icon}</span>{t.label}</button>)}</nav>
    {tab === 'hmi' && <MeltHmi melt={melt} />}
    {tab === 'material' && <MeltChemistry melt={melt} />}
    {tab === 'carbon' && <div className="ms-stack"><MeltCarbon melt={melt} /><h2 className="ms-section">Decarbonisation simulator</h2><MeltSimulator melt={melt} /></div>}
  </div>
}

function ImportMsg({ msg }: { msg: MeltImport }) {
  return <div className={`ms-msg ${msg.error ? 'err' : ''}`}>
    <b>{msg.error ?? `Loaded ${msg.kind === 'heats' ? `${msg.heats.length} heats` : msg.kind === 'chem' ? `${msg.chem.length} spectrometer results` : `${msg.readings.length} readings`}.`}</b>
    {msg.warnings.map((w) => <p key={w}>{w}</p>)}
  </div>
}
