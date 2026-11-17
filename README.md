# ChitoCapture

**Scope 1 and 2 carbon accounting, carbon tax forecasting and decarbonisation planning for Malaysian steel.** Built by Malaysians for Malaysia. Upload your monthly TNB bills, fuel invoices and production, see Scope 1 and Scope 2 clearly, forecast emissions and your carbon tax bill, check you are on track for your target, and export a GHG disclosure laid out for Bursa Malaysia and the NSRF.

> Prototype. Sample factories, factors, prices and measure savings are illustrative and must be verified before any reporting or investment decision. Everything you enter stays in your browser.

## Who it is for

Bursa-listed steel companies and the steel SMEs that supply them. Listed issuers must disclose Scope 1 and 2 emissions under the National Sustainability Reporting Framework (NSRF), and their customers increasingly ask suppliers for the same figures. Malaysia has also announced a carbon tax for the iron, steel and energy sectors without confirming its rate. ChitoCapture answers both questions from the bills a plant already has: **what are our Scope 1 and 2 emissions, and what will the carbon tax cost us?**

## What it does

| | |
|---|---|
| **Dashboard** | Total, Scope 1 and Scope 2 cards with trend lines and change against the prior 12 months; a monthly emissions chart with a 12-month forecast and 80% range; target vs actual; emissions by source; unusual months; and the carbon tax calculator. Tabs switch the view between Total, Scope 1 and Scope 2. |
| **Monthly data** | Upload a CSV or Excel (.xlsx) file: `month`, `electricity_kwh`, fuels in GJ (`natural_gas_gj`, `fuel_oil_gj`, `coal_gj`, `biomass_gj`; diesel as `diesel_litres`), `process_t` and `production_t`. Common month formats (2025-01, Jan 2025, 01/2025) and thousands separators are understood. A template is provided; sample months are shown until data are uploaded. |
| **Forecast** | Explainable on purpose: emissions = production × emissions per tonne. Production follows its trend and month-of-year pattern (Hari Raya and year-end dips); each scope's emissions per tonne follow their own trend. The drivers are shown so auditors can follow every step. |
| **Target tracking** | With production data the target is read per tonne of product, so growth in output is not penalised. Shows on or off track and the gap in the target year. |
| **Unusual months** | Flags months whose electricity or fuel per tonne is far from the site's typical month (median and median absolute deviation), with what to check: a faulty drive, air leaks, a billing error. |
| **Carbon tax calculator** | Uses Singapore's published carbon tax path as a reference (S$25/t in 2024–25, S$45/t in 2026–27, S$50–80/t by 2030), converted to ringgit, applied to actual and forecast Scope 1 (or Scope 1 and 2), with an optional exempt share. Clearly labelled as an assumption until Malaysia sets its rate. |
| **Reports** | A GHG disclosure laid out for Bursa / NSRF (boundary, Scope 1 and 2 with prior years, intensity, Scope 1 by source, methodology and factors, target progress, carbon price exposure, data quality) plus a monthly CSV export. Site carbon, EECA energy and CBAM reports are also available. Save any report as a PDF. |
| **3D site and control rooms** | The plant as a procedurally generated 3D campus, and live 3D simulations of the steel mini-mill (electric arc furnace route) and the wire & galvanising plant, with a carbon ledger, a what-if sandbox (EAF optimisation, variable-speed fans, hot charging, regenerative burners, green electricity) and CBAM exposure. |
| **Plan** | A costed decarbonisation plan with a waterfall to target, payback and an approval workflow. Cost per tonne shows which upgrades are cheaper than paying the carbon tax. |
| **Sensors** | Stream an ESP32 CO₂ sensor into the browser over USB (Web Serial, in Chrome or Edge), or use the built-in simulation. |
| **Sign-in** | Each subscribing company has its own company ID and password and sees only its own company. Demo accounts: `MSD-001` / `steel2026` (steel group) and `DEMO` / `demo2026` (all demo companies). *Prototype only:* accounts are built into the app and data stay in the browser; real accounts need a server (for example Supabase Auth with per-company data). |
| **✦ Ask AI** | A chat box on every page. Ask *“What will carbon tax cost us?”*, *“Which process should we cut first?”* or *“Cut emissions by 30%”*. Built-in answers are calculated from the site's own numbers, with one-click **Add to plan**. Other questions go to Claude when an API key is set (below). |

### Honest numbers
- Scope 2 is location-based (Energy Commission grid factor); Scope 1 uses IPCC 2006 fuel factors plus site process emissions. Biogenic CO₂ from biomass is reported separately.
- Every plan action is **net**: savings minus the action's own energy use.
- Each measure shows the **engineering checks** needed before relying on it, and the basis of its indicative estimate.

## Run it

Requirements: Node.js 22.

```bash
npm install
npm test
npm run dev
```

Open the address Vite prints (usually http://127.0.0.1:5173).

## Deploy

- **Vercel:** import the repository with the **Vite** preset. Leave Root Directory empty, since the app is at the repository root.
- **Real AI in the chat (optional):** in Vercel → your project → **Settings → Environment Variables**, add `ANTHROPIC_API_KEY` with a key from console.anthropic.com, then redeploy. The key stays on the server (`api/chat.ts`); each AI answer costs a few cents. Without a key, the chat uses its built-in answers only.
- **Checks:** the GitHub Actions workflow runs the tests and the build on every push and pull request. Vercel builds and hosts the live site.

## Hardware

See [`firmware/esp32_co2`](firmware/esp32_co2) for an ESP32 + Sensirion SCD41 sketch. Any board that prints `{"co2": 612}` or `{"co2_in": 5100, "co2_out": 820}` lines at 115200 baud works.

CSV import format for machines:

```text
name,kind,electricity_mwh,fuel,fuel_gj,process_t
Boiler 1,boiler,120,natural-gas,40000,0
```

`kind` is one of: kiln, boiler, furnace, mill, fan, pump, compressor, chiller, production-line, genset, wastewater, cold-room, office. `fuel` is one of: none, coal, natural-gas, diesel, fuel-oil, biomass.

## How the numbers work

```text
Machine CO₂e   = electricity MWh × grid factor + fuel GJ × fuel factor ÷ 1000 + process t
Net abatement  = (electricity saved × grid + fuel saved × fuel factor ÷ 1000 + direct cut) − added electricity × grid
Cost per tonne = (capex × capital recovery factor − annual cash saving) ÷ net abatement
Scope 1         = Σ fuel GJ × fuel factor ÷ 1000 + process t
Scope 2         = electricity MWh × grid factor (location-based)
Forecast        = production (trend × month-of-year pattern) × emissions per tonne (trend), 80% range
Carbon tax      = taxed tonnes × Singapore rate (S$/t) × RM per S$
```

Default grid factors are the Energy Commission's 2022 values (Peninsular 0.774, Sabah 0.525, Sarawak 0.199 kg CO₂/kWh). Fuel factors use common IPCC 2006 default CO₂ values. All are editable in Settings.

## Project structure

```text
src/
  model/       types, factors, steel templates, measures, calculations, monthly history,
               forecast, carbon tax, copilot, store (+ tests)
  sensor/      line parser and Web Serial / simulator hub (+ tests)
  three/       procedural 3D campus and plant halls (Three.js)
  components/  3D viewers, charts and shared UI
  views/       Dashboard, Monthly data, Reports, Company, Site 3D, Simulation, Analysis, Plan, Sensors, Settings
api/chat.ts    optional Claude-backed chat (Vercel function)
firmware/esp32_co2/   Arduino sketch for ESP32 + SCD41
```
