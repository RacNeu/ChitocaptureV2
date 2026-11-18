import { useMemo, useState } from 'react'
import { num, ringgit } from '../format'
import Info from '../components/Info'
import { HBars } from '../components/MsCharts'
import { askAI } from '../model/aiClient'
import { scrapTypes, type ScrapType } from '../model/meltshop'
import { SOLAR_MWH_PER_MWP, baseLevers, currentMix, simulate, type Levers, type SimResult } from '../model/meltSim'
import { mean, quantile } from '../model/regress'
import type { Melt } from './MeltShop'

function Slider({ label, value, min, max, step, unit, today, onChange, digits = 0, off }: { label: string; value: number; min: number; max: number; step: number; unit: string; today?: number; onChange: (v: number) => void; digits?: number; off?: string }) {
  return <label className="sim-slider">
    <span className="sim-row"><b>{label}</b><em>{off ?? `${num(value, digits)} ${unit}`}</em></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    {today !== undefined && <span className="sim-row muted"><small>{num(min, digits)}</small><small>today {num(today, digits)} {unit}</small><small>{num(max, digits)}</small></span>}
  </label>
}
function Toggle({ label, on, onChange, note }: { label: string; on: boolean; onChange: (v: boolean) => void; note?: string }) {
  return <label className="sim-toggle"><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} /><span className="sim-switch" aria-hidden="true" /><span><b>{label}</b>{note && <small>{note}</small>}</span></label>
}

function explainLocally(r: SimResult): string[] {
  const saving = (r.base.costPerT - r.scen.costPerT) * r.tPerMonth, co2 = (r.base.co2MktPerT - r.scen.co2MktPerT) * r.tPerMonth / 1_000
  if (!r.steps.length) return ['Move a lever on the left to build a scenario.']
  const top = [...r.steps].sort((a, b) => b.rmPerMonth - a.rmPerMonth)
  return [
    `• This scenario saves about ${ringgit(saving)} a month and ${num(co2)} t CO₂e a month (market-based).`,
    ...top.slice(0, 3).map((s) => `• ${s.label}: ${ringgit(s.rmPerMonth)}/month, ${num(s.co2TPerMonth, 1)} t CO₂/month (${s.basis}).`),
    ...(r.steps.some((s) => s.id === 'shift') ? ['• Off-peak melting saves money but no CO₂: the grid factor is the same all day.'] : []),
    ...r.warnings.map((w) => `• ${w}`),
  ]
}

export default function MeltSimulator({ melt }: { melt: Melt }) {
  const hs = melt.heats
  const mixNow = useMemo(() => currentMix(hs), [hs])
  const today = {
    hold: mean(hs.map((h) => h.holdMin ?? 0)), holdBest: quantile(hs.map((h) => h.holdMin ?? 0), 0.25),
    lid: mean(hs.map((h) => h.lidOpenMin ?? 0)), lidBest: quantile(hs.map((h) => h.lidOpenMin ?? 0), 0.25),
    tap: mean(hs.map((h) => h.tapTempC ?? melt.s.tapTargetC)), tapMax: quantile(hs.map((h) => h.tapTempC ?? melt.s.tapTargetC), 0.98),
    fill: mean(hs.map((h) => h.fill)),
  }
  const [lv, setLv] = useState<Levers>(baseLevers())
  const set = (patch: Partial<Levers>) => setLv((x) => ({ ...x, ...patch }))
  const r = useMemo(() => simulate(hs, melt.model, melt.s, melt.grid, melt.data.chem, lv), [hs, melt.model, melt.s, melt.grid, melt.data.chem, lv])
  const saving = (r.base.costPerT - r.scen.costPerT) * r.tPerMonth
  const co2Cut = (r.base.co2MktPerT - r.scen.co2MktPerT) * r.tPerMonth / 1_000
  const [ai, setAi] = useState<{ lines: string[]; source: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const mix = lv.mix ?? mixNow
  const setMix = (id: ScrapType, v: number) => {
    // Keep the total at 100%: the change comes out of heavy melting scrap (or goes into it).
    const next = { ...mix, [id]: v }
    const others = scrapTypes.filter((x) => x.id !== 'hms').reduce((a, x) => a + next[x.id], 0)
    next.hms = Math.max(0, 100 - others)
    set({ mix: next })
  }
  const presets: { label: string; patch: Partial<Levers> }[] = [
    { label: 'Best-quarter practice', patch: { holdCap: Math.round(today.holdBest), lidCap: Math.round(today.lidBest), tapCap: melt.s.tapTargetC, preheatLining: true, minFill: 0.95 } },
    { label: 'Half off-peak', patch: { shiftOffPeak: 0.5 } },
    { label: 'Net-zero push', patch: { holdCap: Math.round(today.holdBest), lidCap: Math.round(today.lidBest), tapCap: melt.s.tapTargetC, preheatLining: true, minFill: 0.95, solarMWp: 15, greenShare: 1, igbt: true } },
  ]
  const explain = async () => {
    setBusy(true)
    const context = {
      page: 'Melt shop decarbonisation simulator (induction furnaces + ladle furnace)', demo: melt.isDemo,
      today: { kwhPerT: Math.round(r.base.ifKwhPerT), costRMPerT: Math.round(r.base.costPerT), co2KgPerT: Math.round(r.base.co2MktPerT), yieldPct: +r.base.yieldPct.toFixed(1), cuPct: r.base.cuPct, tonnesPerMonth: Math.round(r.tPerMonth) },
      scenario: { kwhPerT: Math.round(r.scen.ifKwhPerT), costRMPerT: Math.round(r.scen.costPerT), co2KgPerT: Math.round(r.scen.co2MktPerT), yieldPct: +r.scen.yieldPct.toFixed(1), cuPct: r.scen.cuPct, savingRMPerMonth: Math.round(saving), co2CutTPerMonth: Math.round(co2Cut), capexRM: r.capexRM },
      levers: lv, steps: r.steps.map((s) => ({ ...s, rmPerMonth: Math.round(s.rmPerMonth), co2TPerMonth: +s.co2TPerMonth.toFixed(1) })), warnings: r.warnings,
      method: 'Effects come from factors learned from the plant’s own heats (regression) or sourced published values; see docs/induction-furnace-model.md.',
    }
    const text = await askAI([{ role: 'user', content: 'Explain this melt-shop scenario to the plant manager in plain words: what changes, why it saves money and carbon, the biggest risks, and what to try first on the shop floor.' }], context)
    setAi(text ? { lines: text.split('\n').filter((l) => l.trim()), source: 'Claude' } : { lines: explainLocally(r), source: 'built-in (AI not connected)' })
    setBusy(false)
  }
  const row = (label: string, a: number, b: number, unit: string, digits = 0, better: 'low' | 'high' = 'low') => {
    const good = better === 'low' ? b < a - 1e-9 : b > a + 1e-9, bad = better === 'low' ? b > a + 1e-9 : b < a - 1e-9
    return <div className="sim-res"><span>{label}</span><b className="muted">{num(a, digits)}</b><i>→</i><b className={good ? 'good' : bad ? 'bad' : ''}>{num(b, digits)}</b><small>{unit}</small></div>
  }

  return <div className="ms-grid sim">
    <section className="ms-card sim-levers">
      <div className="ms-card-head"><h3>Levers</h3><button type="button" className="link" onClick={() => setLv(baseLevers())}>Reset</button></div>
      <div className="sim-presets">{presets.map((p) => <button key={p.label} type="button" onClick={() => set(p.patch)}>{p.label}</button>)}</div>

      <details open><summary>Process practice</summary>
        <Slider label="Max holding per heat" value={lv.holdCap ?? Math.ceil(quantile(hs.map((h) => h.holdMin ?? 0), 0.98))} min={2} max={Math.ceil(quantile(hs.map((h) => h.holdMin ?? 0), 0.98))} step={1} unit="min" today={today.hold} onChange={(v) => set({ holdCap: v })} off={lv.holdCap === null ? 'as today' : undefined} />
        <Slider label="Max lid-open time" value={lv.lidCap ?? Math.ceil(quantile(hs.map((h) => h.lidOpenMin ?? 0), 0.98))} min={1} max={Math.ceil(quantile(hs.map((h) => h.lidOpenMin ?? 0), 0.98))} step={1} unit="min" today={today.lid} onChange={(v) => set({ lidCap: v })} off={lv.lidCap === null ? 'as today' : undefined} />
        <Slider label="Max tap temperature" value={lv.tapCap ?? Math.ceil(today.tapMax)} min={melt.s.tapTargetC - 10} max={Math.ceil(today.tapMax)} step={1} unit="°C" today={today.tap} onChange={(v) => set({ tapCap: v })} off={lv.tapCap === null ? 'as today' : undefined} />
        <Slider label="Minimum furnace fill" value={(lv.minFill ?? 0.8) * 100} min={80} max={100} step={1} unit="%" today={today.fill * 100} onChange={(v) => set({ minFill: v / 100 })} off={lv.minFill === null ? 'as today' : undefined} />
        <Toggle label="Gas-preheat cold linings" on={lv.preheatLining} onChange={(v) => set({ preheatLining: v })} note="DOE trial: first-heat lining loss −39%" />
      </details>

      <details open><summary>Scrap mix & yield</summary>
        {scrapTypes.filter((x) => x.id !== 'hms' && (mixNow[x.id] > 0.1 || (lv.mix?.[x.id] ?? 0) > 0)).map((x) => <Slider key={x.id} label={x.label} value={mix[x.id]} min={0} max={60} step={0.5} unit="%" today={mixNow[x.id]} digits={1} onChange={(v) => setMix(x.id, v)} />)}
        <p className="ms-note">Heavy melting scrap fills the rest: <b>{num(mix.hms, 1)}%</b>. Predicted copper <b className={r.scen.cuPct !== null && r.scen.cuPct > r.cuLimit * 0.85 ? 'bad' : ''}>{r.scen.cuPct !== null ? `${num(r.scen.cuPct, 3)}%` : '—'}</b> (limit {r.cuLimit}).</p>
      </details>

      <details open><summary>Power timing & tariff</summary>
        <Slider label="Peak-hour melting moved off-peak" value={lv.shiftOffPeak * 100} min={0} max={100} step={5} unit="%" onChange={(v) => set({ shiftOffPeak: v / 100 })} />
        <p className="ms-note">Peak melting demand today ≈ {num(r.peakDemandKW / 1_000, 1)} MW · power supplies on {num(r.utilisation * 100)}% of the time.</p>
      </details>

      <details open><summary>Clean power & equipment</summary>
        <Slider label="Rooftop / ground solar" value={lv.solarMWp} min={0} max={40} step={1} unit="MWp" onChange={(v) => set({ solarMWp: v })} />
        <Slider label="Green electricity (GET / PPA)" value={lv.greenShare * 100} min={0} max={100} step={5} unit="%" onChange={(v) => set({ greenShare: v / 100 })} />
        {lv.greenShare > 0 && <Slider label="Green premium" value={lv.greenPremiumSen} min={0} max={10} step={0.5} unit="sen/kWh" digits={1} onChange={(v) => set({ greenPremiumSen: v })} />}
        <Toggle label="IGBT power supplies" on={lv.igbt} onChange={(v) => set({ igbt: v })} note="Vendors claim 5–25%; 5% used" />
      </details>
    </section>

    <div className="ms-stack">
      <section className="ms-card sim-head">
        <div className="sim-big"><span>Saving</span><b className={saving >= 0 ? 'good' : 'bad'}>{ringgit(saving)}</b><small>a month</small></div>
        <div className="sim-big"><span>CO₂ cut (market-based)</span><b className={co2Cut >= 0 ? 'good' : 'bad'}>{num(co2Cut)}</b><small>t a month</small></div>
        <div className="sim-big"><span>Investment</span><b>{r.capexRM ? ringgit(r.capexRM) : '—'}</b><small>{r.capexRM && saving > 0 ? `payback ${num(r.capexRM / (saving * 12), 1)} yrs` : r.capexRM ? 'no payback' : 'practice changes only'}</small></div>
      </section>
      <section className="ms-card">
        <h3>Today → scenario <Info>Monthly figures from your uploaded period scaled to a 30.4-day month ({num(r.tPerMonth)} t/month). Electricity priced at TNB peak/off-peak rates; solar at {SOLAR_MWH_PER_MWP} MWh per MWp a year, valued at the off-peak rate.</Info></h3>
        <div className="sim-results">
          {row('Induction furnace energy', r.base.ifKwhPerT, r.scen.ifKwhPerT, 'kWh/t')}
          {row('Electricity cost', r.base.elecRMPerT, r.scen.elecRMPerT, 'RM/t', 1)}
          {row('Scrap cost', r.base.scrapRMPerT, r.scen.scrapRMPerT, 'RM/t', 1)}
          {row('Metallic yield', r.base.yieldPct, r.scen.yieldPct, '%', 2, 'high')}
          {row('CO₂ (location-based)', r.base.co2LocPerT, r.scen.co2LocPerT, 'kg/t')}
          {row('CO₂ (market-based)', r.base.co2MktPerT, r.scen.co2MktPerT, 'kg/t')}
          {r.base.cuPct !== null && row('Copper', r.base.cuPct, r.scen.cuPct ?? 0, '%', 3)}
        </div>
        {r.warnings.map((w) => <p key={w} className="sim-warn">⚠ {w}</p>)}
      </section>
      <section className="ms-card">
        <h3>Saving by lever</h3>
        {r.steps.length ? <HBars rows={[...r.steps].sort((a, b) => b.rmPerMonth - a.rmPerMonth).map((s) => ({ label: s.label, value: Math.max(0, s.rmPerMonth), color: s.rmPerMonth >= 0 ? '#10b981' : '#f43f5e', note: `${s.rmPerMonth < 0 ? `costs ${ringgit(-s.rmPerMonth)} · ` : ''}${num(s.co2TPerMonth, 1)} t CO₂/month · ${s.basis}` }))} unit="RM/mo" /> : <p className="ms-note">Move a lever or pick a preset.</p>}
      </section>
      <section className="ms-card sim-ai">
        <div className="ms-card-head"><h3>✦ Explain this scenario</h3><button type="button" className="btn small" onClick={() => void explain()} disabled={busy}>{busy ? 'Thinking…' : 'Explain'}</button></div>
        {ai ? <><div className="sim-ai-text">{ai.lines.map((l, i) => <p key={i}>{l}</p>)}</div><small className="muted">Answer from {ai.source}. The numbers come from the model above, not from the AI.</small></> : <p className="ms-note">Claude reads this scenario’s numbers and explains them in plain words for the shift team. The optimisation itself is the maths above, so every number stays traceable.</p>}
      </section>
    </div>
  </div>
}
