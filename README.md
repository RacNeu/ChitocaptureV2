# ChitoCapture

**A live carbon twin and copilot for factories, starting with Malaysian steel.** See every machine's CO₂ on an interactive 3D floor map, ask the copilot where to start, build a costed plan that hits your target, and connect real CO₂ sensors, including a benchtop chitosan capture rig that measures sorbent capacity.

> Prototype. Sample factories, factors, prices and measure savings are illustrative and must be verified before any reporting or investment decision. Everything you enter stays in your browser.

## Why steel first

Malaysian steel faces two carbon prices at once: the EU's Carbon Border Adjustment Mechanism (CBAM), whose definitive regime began on 1 January 2026, and the national carbon tax announced for the iron, steel and energy sectors (check the latest official announcement for its rate and start date). Both ask the same question: **how much CO₂ is in each tonne of steel?** ChitoCapture answers it live, then shows how to cut it.

## What it does

| | |
|---|---|
| **1. Set up in a minute** | Pick your industry (steel mini-mill, cement, palm oil, food and beverage, electronics or textile), adjust the machine list or import a CSV, and choose your grid and target. |
| **2. 3D plant** | A procedurally generated 3D factory campus (kilns, boiler houses, silos, stacks, cooling towers, pipe racks, wastewater basins, offices, roads, fence and trees), built in code from your machine list with no paid models or downloads. Hover any building for a live info card, click to fly to it, drag to orbit. |
| **Two looks** | **Real** (textured brick, concrete panels with windows, corrugated roofs, lawns, asphalt, trees, fence, lamps, smoke) and **Model** (a pure model: plain blue volumes with outlines, no decoration; the biggest emitters turn red, with light beams sized by CO₂). Switching runs a scanning sweep that converts the plant building by building. A lightweight **2D map** is also available. |
| **Today / With plan** | Watch smoke, beams and heat drop as actions are added to the plan. Live sensor readings appear on linked buildings. |
| **Analysis** | A ranked 3D skyline of every emission source, each tower split into grid electricity, fuel and process CO₂, plus the 80% rule (how few sources cause most emissions), the main cause, a ranking table and an illustrative carbon-cost slider in RM per tonne. Works for Today and With plan. |
| **🔥 Control room** | A live 3D cutaway of a steel mini-mill: scrap yard → electric arc furnace (glow, sparks and power that swing through each heat) → ladle → ladle furnace → caster → hot billets → reheating furnace → rolling mill. Animated electricity and gas lines, smoke from the stacks, live tickers (MW, t CO₂/h, kg CO₂ per tonne, RM carbon cost), hover any unit for live readings. |
| **What-if sandbox** | Toggle EAF optimisation, variable-speed fume fans, hot charging, regenerative burners, green electricity and chitosan capture on the reheat stack. See kg/t, kt/yr, capex and payback change instantly. |
| **CBAM exposure** | A simplified estimate of CBAM cost per tonne and per year, using direct emissions, the year's phase-in share, EU carbon price, exchange rate and deduction of carbon price paid in Malaysia. Today vs with upgrades. |
| **3. Copilot** | One-tap questions: *Where should I start? How do I hit my target? What saves the most money? Is carbon capture worth it? How reliable is my data?* Answers are computed from your own numbers, with no AI service or API key needed. It can build a plan for you. |
| **4. Plan** | A waterfall from today to target, a year-by-year trajectory, investment, annual savings and payback, plus an action table with start years. Save it as a PDF to share. |
| **5. Sensors** | Plug an ESP32 CO₂ sensor into USB and stream it straight into the browser (Web Serial, in Chrome or Edge), or use the built-in simulation. |
| **6. Chitosan capture lab** | With sensors before and after a sorbent column, the app draws the breakthrough curve and integrates the CO₂ captured into **mmol/g**. One click feeds that measured capacity into every capture estimate in the app. |

### Honest numbers
- Every action is **net**: savings minus the action's own energy use. Carbon capture is compared fairly against efficiency, heat recovery, fuel switching and process changes, and is flagged when it does not pay off in CO₂ terms.
- Each measure shows the **engineering checks** needed before relying on it, and the basis of its indicative estimate.
- Biogenic CO₂ from biomass is reported separately and not counted in the gross total.

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
- **GitHub Pages:** in **Settings → Pages**, set the source to **GitHub Actions**. The workflow tests, builds and publishes to `https://<user>.github.io/ChitocaptureV2/`.

## Hardware

See [`firmware/esp32_co2`](firmware/esp32_co2) for an ESP32 + Sensirion SCD41 sketch (single sensor or a two-sensor capture rig). Any board that prints `{"co2": 612}` or `{"co2_in": 5100, "co2_out": 820}` lines at 115200 baud works.

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
Sorbent needed = (captured t/yr ÷ cycles per year) ÷ (capacity mmol/g × 44.01 ÷ 1000)
Rig capacity   = Σ (C_in − C_out) ppm × 10⁻⁶ × flow L/min ÷ 22.414 × Δt min ÷ sorbent g
```

Default grid factors (Peninsular Malaysia 0.74 and Sabah 0.539 kg CO₂e/kWh) were carried over from the earlier prototype and are marked for verification against the Energy Commission's latest grid emission factor publication. Fuel factors use common IPCC 2006 default CO₂ values. All are editable in Settings.

## Project structure

```text
src/
  model/       types, factors, industry templates, measure library, calculations, copilot, store (+ tests)
  sensor/      line parser, Web Serial and simulator hub, capture-rig analysis (+ tests)
  three/       procedural 3D campus builder (Three.js)
  components/  3D plant viewer, 2D floor map and charts
  views/       Onboarding, Twin, Plan, Sensors, Settings
firmware/esp32_co2/   Arduino sketch for ESP32 + SCD41
```
