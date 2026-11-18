# Calculations used in ChitoCapture

Every formula the app uses, sorted into three groups:

- **A. From a standard or a law of physics.** Fixed rules everyone uses. If we copy them correctly, the result is correct.
- **B. Built by us.** Our own models. For each one: why it is right, and how we checked it.
- **C. Uncertain.** Values or methods with weak or conflicting sources. Treat the results as estimates.

The section at the end, "How we made sure", lists the checks. The proof (numbers and tests) is in
[accuracy-and-validation.md](accuracy-and-validation.md), and the data these formulas use is in
[data-sources.md](data-sources.md).

---

## A. From a standard or a law of physics

These are fixed rules, not opinions. Our job was to copy them correctly, and the tests check that we did.

| # | Calculation | Formula | Standard / source | Where in the code |
|---|---|---|---|---|
| A1 | **Scope 2, location-based** | electricity (kWh) × grid factor (kg CO₂/kWh) | GHG Protocol Scope 2 Guidance; factor from the Energy Commission (Malaysia), as Bursa's GHG calculator uses | `calc.ts`, `history.ts` |
| A2 | **Scope 2, market-based** | (electricity − green electricity) × residual or grid factor; green electricity counts as 0 | GHG Protocol Scope 2 Guidance (market-based method) | `history.ts` |
| A3 | **Scope 1, fuel** | fuel (GJ) × IPCC default factor (e.g. gas 56.1, diesel 74.1 kg CO₂/GJ) | IPCC 2006 Guidelines, Vol. 2, stationary combustion | `factors.ts`, `calc.ts` |
| A4 | **Scope 1, carbon in materials** | carbon (kg) × 44/12 | Carbon mass balance: CBAM Implementing Regulation (EU) 2023/1773; ISO 14404 (steel CO₂ intensity) | `meltshop.ts` (`CO2_PER_C`) |
| A5 | **Biomass** | biogenic CO₂ not counted in the gross total | GHG Protocol | `factors.ts` |
| A6 | **Carbon equivalent (CEV)** | C + Mn/6 + (Cr + Mo + V)/5 + (Ni + Cu)/15 | IIW formula, used by BS 4449:2005 | `meltshop.ts` (`cev`) |
| A7 | **Rebar chemistry limits** | each element ≤ its maximum; CEV ≤ 0.50 | BS 4449:2005, the basis of MS 146 (from an unofficial copy: confirm against the purchased standard) | `meltshop.ts` (`gradeLimits`) |
| A8 | **Energy baseline and CUSUM** | energy = fixed + per-tonne × tonnes (least squares); saving = expected − actual; running total = CUSUM | ISO 50006 (energy baselines); fit quality judged by ASHRAE Guideline 14 (CV(RMSE) ≤ 15% monthly) | `baseline.ts` |
| A9 | **TNB time-of-use** | peak = Mon–Fri 14:00–22:00; no maximum-demand charge off-peak (MV/HV) | TNB tariff, July 2025 | `meltshop.ts` (`isPeak`), `interval.ts` |
| A10 | **Maximum demand** | highest 30-minute average kW in the month | TNB billing rule | `interval.ts` |
| A11 | **EECA applicability** | applies in Peninsular Malaysia and Labuan when energy ≥ 21,600 GJ/yr | Energy Efficiency and Conservation Act 2024 (Act 861) | `malaysia.ts` |
| A12 | **CBAM cost** | direct t CO₂/t × (EU price − carbon price paid in Malaysia) × phase-in share × tonnes exported | EU CBAM Regulation 2023/956. For iron and steel, direct emissions are charged | `steel.ts` (`cbam`) |
| A13 | **Heat carried by cooling water** | Q (kW) = flow (kg/s) × 4.18 kJ/kg·K × ΔT | Physics: heat capacity of water | `meltshop.ts` (`coilLossKW`), `furnaceSim.ts`, `feed.ts` |
| A14 | **Radiation from the bath** | P = ε σ T⁴ × area (σ = 5.67 × 10⁻⁸) | Physics: Stefan–Boltzmann law | `furnaceSim.ts` |
| A15 | **Heating liquid steel** | ΔT = energy ÷ (0.23 kWh/t·°C × tonnes) | Physics: c_p ≈ 0.82 kJ/kg·K (matches CTC-N 0.23 kWh/t·°C) | `furnaceSim.ts` |
| A16 | **Three-phase current** | I = P ÷ (√3 × V × cos φ) | Electrical engineering | `furnaceSim.ts` |
| A17 | **Unit conversions** | 1 MWh = 3.6 GJ; 1 short ton = 0.907 t (kWh/short ton × 1.102 = kWh/t); diesel 0.0386 GJ/L | SI; IPCC net calorific value | throughout |
| A18 | **Simple payback** | capex ÷ yearly saving | Standard finance | `calc.ts` |
| A19 | **Cost per tonne CO₂ (MAC)** | (capex × capital recovery factor − yearly saving) ÷ tonnes avoided | Standard marginal-abatement-cost method; the capital recovery factor uses the user's discount rate | `calc.ts` |

**Why these are right:** they are definitions. The only ways to get them wrong are a typo, a wrong
unit or a wrong factor, and tests catch those. Example: rule A1 reproduces Masteel's published Scope 2
for three years to within 0.5 t CO₂ (0.000% difference). See the accuracy doc.

---

## B. Built by us

### B1. Induction furnace heat simulator (Melt shop → Furnace HMI)

**What it does:** it steps through one heat in 15-second steps (charging → melting → superheat →
holding → tapping) and keeps an energy balance at every step:

```
electricity in × 97% (converter)
  = coil copper loss (24%)          → coil water
  + conduction through the lining   → coil water
  + radiation from the bath (εσT⁴, lid open or closed)
  + heat absorbed by the steel
```

- **Melting:** the scrap needs 389 − 0.23 × 70 = 373 kWh/t to be liquid at 1,530 °C, plus +30 kWh/t × turnings share, −15 × shredded share, and +75 if the lining is cold (heat the lining soaks up).
- **Superheat:** after that, the bath heats at 0.23 kWh/t per °C until it reaches the tap aim.
- **Holding:** power covers only the losses.
- **Lid:** the set lid-open minutes happen once the bath is liquid (sampling, additions), when radiation is ~1 MW with the lid open.
- **Coil water:** the outlet temperature is inlet + (copper loss + conduction) ÷ (flow × 4.18).

**Why it is right:**
1. Each piece is a physics law (A13–A15) or a published figure (389 kWh/t, 0.23 kWh/t·°C, 97%).
2. The total lands inside published measurements. At the default set points (14 min holding, 6 min lid open, 15% turnings) it gives **589 kWh/t**, inside DOE's "typical" 584–661 kWh/t (530–600 kWh/short ton) and the 521–734 kWh/t DOE measured on real heats. Good practice (Otto Junker 500–560) needs less holding and lid time, which the HMI shows when you lower them.
3. Its energy split matches DOE's measured heats: **66%** into the liquid steel (DOE 54–71%) and **26%** into the coil water (DOE 26–29%).
4. Each set point moves the result the way physics says. These are tested (`furnaceSim.test.ts`):

| Change | Simulator result | Published | Agrees? |
|---|---|---|---|
| Hold 30 min instead of 14 | +5.6 kWh/t (0.35 per min) | ~0.3 per min (Otto Junker, 275 kW on 15 t) | ✔ |
| Tap at 1,650 °C instead of 1,620 | +8.8 kWh/t (0.29 per °C) | 0.23 (into steel) to 0.4 (from grid) per °C | ✔ |
| Cold lining | +111 kWh/t | DOE: +105 to +119 kWh/t | ✔ |
| Lid open 20 min instead of 0 | +0.40 kWh/t per min | 0.3–0.9 per min (Otto Junker 20 min ≈ +15 kWh/t; radiation physics) | ✔ |
| Half power (16 MW) | higher kWh/t, ≥ 1.6× longer power-on | Otto Junker: running below full power costs more | ✔ |

**Tuned parts:** the 24% coil copper loss, the 700 kW lining conduction and the 75 kWh/t cold-lining heat were set by us so the energy split and the cold-lining penalty match DOE's measurements. They are not measured directly. See C5.

### B2. Learning a plant's own factors (Melt shop → Energy & thermal)

**What it does:** it fits one line through all the plant's heats (ordinary least squares):

```
kWh/t = base + a·holding + b·lid open + c·tap °C + d·cold lining + e·shredded share + f·turnings share + g·fill
```

Each factor gets a **90% range** (coefficient ± 1.645 × standard error). The app uses a learned factor
only when:
- there are at least **30 clean heats** and 5 heats per factor,
- the driver actually varies (≥ 10 heats away from the typical value),
- the sign matches physics (more holding can't save energy),
- it is not far outside the published range.

Otherwise it falls back to the published value and says so.

**Why it is right:**
- OLS with standard errors is the textbook method for "how much does each thing add".
- The safety rules stop it from reporting nonsense when the data is thin.
- **Test:** on the demo dataset, where we know the true answers, it recovers **all 7** within their 90% ranges (accuracy doc, table 3).

**Limit:** this proves the method works on data that follows a straight-line rule. A real plant's
data is messier; that is what the published-range checks are for.

### B3. Prediction with a range ("what if we hold 5 min less?")

The predicted kWh/t at new settings is x·β. The 90% range is ±1.645 × √(x·Cov·xᵀ), the standard
confidence interval for a regression prediction. It comes from the same fit as B2.

### B4. Losses ranked in ringgit (vs the plant's own best quarter)

For each driver: how much worse the average heat is than the plant's **best 25% of heats**, times the
factor, times the price, times tonnes per month.
- **Holding / lid:** the minutes above the plant's 25th percentile.
- **Superheat:** the °C above the tap target.
- **Cold lining:** the share of cold heats × factor × 0.45 (DOE: gas preheating cuts lining loss 95 → 58).
- **Peak hours:** the share of melting kWh falling in TNB peak × (peak − off-peak price).
- **Yield:** (1/average yield − 1/best-quarter yield) × scrap price.
- **LF:** the average minus the best-quarter kWh/t.

**Why it is right:** it compares the plant with **itself**, not with a guessed ideal, so the target is
already proven possible on that furnace. Each loss carries the factor's range, so the ringgit figure
comes with a low and a high.

### B5. Copper each scrap type brings (Material & yield)

Least squares with no intercept: Cu% of the heat = Σ (scrap share × that scrap's Cu%). Because the
shares add up to 1, each coefficient is that scrap's own copper. Negative results are set to 0.

**Why it is right:** it is a mass balance (copper is not removed in an induction furnace: no oxygen
refining). **Test:** it recovers the demo's built-in copper per scrap type to within 0.01% (accuracy doc).

### B6. Anomaly detection on coil water (HMI F3, Live data)

A reading is unusual if it is outside **median ± 4 × 1.4826 × MAD** of that furnace's last 60
readings in the same state (melting or idle), by at least a minimum (1.5 °C for ΔT, 25 m³/h for flow),
for **3 readings in a row**.

**Why it is right:**
- 1.4826 × MAD is the standard robust estimate of σ, so one bad reading can't stretch the band.
- Judging melting and idle separately stops the normal jump when power comes on from alarming.
- 3 in a row filters single noisy samples.
- **Test:** on the demo readings (4 furnaces × 48 h) it flags only the injected IF3 fault, with no false alarms.

### B7. Live alert engine (Settings → Live data & alerts; the same rules run in the Supabase function)

Fixed limits (flow, outlet temperature, ΔT, earth leakage, bath over aim) plus the B6 anomaly check.
Each alert is raised **once**, can escalate from warning to alarm, and clears only after 3 clean
minutes. **Test:** a pump trip, a coil leak and lining wear each raise the right alarm, at most once (a warning may escalate to an alarm), with no alarm on the other furnaces, and 4 healthy hours raise no alarm. The limits themselves are examples (C6).

### B8. Sample steel mill and 3D simulation

```
tonnes/yr = heat size × 60 / tap-to-tap × hours
CO₂/t     = Σ kWh/t × grid × (1 − green share) + melt direct + reheat GJ/t × 56.1
```

- **3D simulation:** spreads the same energy over a 34-minute shop cycle with a phase power profile, scaled so the cycle average equals the annual figure.
- **Upgrades:** each one cuts its own unit by a fixed share. Savings add as shares, the same way the Plan adds measures.

**Why it is right:** the annual figures are A1/A3 applied to the kWh/t table. Tests check:
- about 800 kt/yr,
- furnace power never above the two 31 MW supplies (peak 61.7 MW),
- the 3D average equals the annual figure,
- the sandbox gives the same saving as the Plan for every upgrade.

**Limit:** the melt shop's 520 kWh/t was **tuned** to match Masteel, so the agreement with Masteel is partly by design (accuracy doc).

### B9. Wire drawing and galvanising

- **Drawing work** = flow stress × true strain ÷ density ÷ efficiency, with true strain ε = 2 ln(d₀/d₁).
- **Gas** = heat into the wire and zinc + wall losses, ÷ burner efficiency.
- **Zinc** = coating g/m² × wire surface m²/t × (1 + dross).

**Why it is right:** standard metal-forming mechanics and heat balance. **Test:** drawing energy must land between 60 and 118 kWh/t, below Suliga et al. (2023), who measured 118–155 kWh/t on harder 0.42% C wire drawn further. Low-carbon wire should need less, so this is the expected direction.

### B10. Calibration to bills ("one source of truth")

The machine list is scaled, stream by stream (electricity, each fuel, process CO₂), so its yearly
total equals the last 12 months of bills. Metered machines are left alone. Energy with no machine
goes to an "Other (from bills)" line. **Why it is right:** the bills are the measured truth, and
nothing is invented or lost. Tests check that totals match exactly.

### B11. Forecast

```
emissions = production × emissions per tonne
```

Production is forecast from its trend and month-of-year pattern, and each scope's per-tonne figure
from its own trend, with a band. It is deliberately simple so an auditor can follow it. **Test:** it
recovers a known trend + seasonality and flags the faulty month in the sample history.

### B12. Carbon tax estimate

```
tax = rate (RM/t) × Scope 1 (or Scope 1+2) × (1 − exempt share)
```

The rate follows Singapore's legislated path converted to RM, because Malaysia has not set one. The
arithmetic is simple and tested. **The rate is the uncertain part** (C1).

### B13. Plant early warnings (Risks page)

Each warning is **leading signal → trend → time to the limit → action**:

| Warning | Signal | Limit | Method |
|---|---|---|---|
| Coil cooling (per furnace) | Hourly median ΔT and flow while melting | ΔT 20 °C, flow 300 m³/h (example limits) | Theil–Sen trend; days = gap ÷ slope; recent anomalies (B6) raise it to "watch" |
| Lining (per furnace) | Heats on the current lining, heats a day | Usual lining life: the plant's setting, else its own past relines, else (demo only) 450 | Heats left ÷ heats a day; range from the 25th–75th percentile of heats a day |
| Chemistry (shop) | Off-spec heats in the last 7 days; 95th percentile of the tightest element | BS 4449 limits | Counts plus a Theil–Sen trend of the daily average |
| Furnace energy (per furnace) | kWh/t minus what the learned factors (B2) expect for that heat's practice | The shop's own normal | Mean gap with its standard error; a rising Theil–Sen trend means "creeping up" |

**Why it is right:** the Theil–Sen slope is the median of all pairwise slopes, so one bad hour or heat can't swing it (a standard robust trend; its 90% range uses the Mann–Kendall rank formula). A date is only shown when the whole 90% range points at the limit and the date is within ~3 months. **Test:** on the demo data it forecasts IF1's ΔT reaching 20 °C in 4–5 days, keeps the healthy coils at "OK", flags IF3's drop as an event without a date, orders relines IF4 → IF3 → IF1 → IF2, finds IF4's extra +10 kWh/t, and reports the 5 off-spec heats (`src/model/warnings.test.ts`).

**Limits:** trends assume the recent rate continues; real wear often speeds up near the end, so the "act" threshold is 7 days. Flood and heat risks (NASA climate data) were removed: they couldn't be acted on and rested on a 50 km grid.

---

## C. Uncertain: treat as estimates

| # | Item | Why uncertain | What the app does about it |
|---|---|---|---|
| C1 | Malaysian carbon tax rate and coverage | Announced for iron and steel in Budget 2026, but no rate or start date | Uses Singapore's path; low/mid/high cases; editable; labelled "estimate" |
| C2 | IGBT vs thyristor saving | Vendor claims of 5–25%, no independent steel data | Uses the low end (5%); asks for a supplier quote |
| C3 | Upgrade costs (capex) and the measures library percentages | Design estimates, not quotes | Labelled "indicative planning assumption"; editable |
| C4 | Holding, lid, rust, sand, charge-density effects | From one vendor (Otto Junker), not independent measurements | Used only until the plant has 30+ heats; then its own data replaces them |
| C5 | Simulator coil copper loss (24%), lining conduction (700 kW) and cold-lining heat (75 kWh/t) | Tuned to DOE's measured split, not measured on a 60 t furnace | Tests hold the coil-water share at 25–30%, steel share at 63–72% and cold lining at +100–125 kWh/t |
| C6 | Alarm set points (flow 300, outlet 55 °C, ΔT 20, leakage 15/25 mA) | Every coil maker sets its own | Labelled "example"; the anomaly check learns each furnace's normal band instead |
| C7 | LF electrode consumption | No clean LF-only source (EAF: 1.1–3.0 kg/t) | Learned from the plant's own LF data |
| C8 | TNB HV energy rates (44.52 / 40.43 sen) | From consultancy guides, not seen on the official page | Editable; tagged as assumption until the plant enters its bill |
| C9 | Scrap, electrode and gas prices | No public price | Editable assumptions |
| C10 | Sample mill caster, rolling, fume and utilities kWh/t; reheating 1.2 GJ/t | Placeholders. Rolling is likely low (Masteel implies 110–150 kWh/t) | Replaced by the plant's bills via B10 |
| C11 | CBAM phase-in schedule | Simplified from the EU schedule, which may change | Labelled "simplified, check the current regulation" |
| C12 | HMI electrical values (coil V, kA, DC link, Hz) | Indicative only | Not used in any energy, money or CO₂ figure |
| C13 | 3D simulation phase shares and power profile | Assumptions | The average is forced to equal the annual figure, so totals are not affected |
| C14 | Lid-open effect in the simulator | Comes from radiation physics with an assumed 85% kept in by a closed lid; gives 0.40 kWh/t per min, at the low end of the vendor's ~0.75 | A plant's own heats (B2) replace it |
| C15 | Grid factor: 0.774 (Energy Commission 2022) in most of the app, 0.74 (Single Buyer 2024) in the sample mill | Two official sources, different years | Both editable; see the accuracy doc |

---

## How we made sure these are right

| Check | What it proves | Covers |
|---|---|---|
| **Reproduce a real company's published numbers** (Masteel FY2022–FY2024) | Our Scope 1/2 formulas, units and factors match how a listed Malaysian steelmaker reports | A1, A3, A17 |
| **Physics cross-check:** two independent ways to the same number (e.g. steel enthalpy 389 vs DOE-measured 386–397 kWh/t; 0.23 ÷ ~0.6 efficiency ≈ 0.4 kWh/t·°C vs the vendor's 20 kWh/t per 50 K) | The published figures agree with each other and with physics | B1, C4 |
| **Range check:** model output must fall inside published measurement ranges | The simulator and sample mill are realistic | B1, B8, B9 |
| **Known-answer tests:** build data with answers we put in, check the app finds them | The statistics (regression, copper, anomalies, forecast) work | B2–B7, B11 |
| **Consistency tests:** the same thing calculated two ways must agree (sandbox vs Plan, 3D vs annual, machines vs bills) | No page contradicts another | B8, B10 |
| **Physics guards in the app:** a heat below 389 kWh/t, or tapping more than was charged, is flagged as a data error | Bad uploads can't produce impossible results | B2 |
| **Compliance mapping:** Scope 1/2 split, location- and market-based Scope 2, and IPCC factors follow the GHG Protocol; Bursa CSI uses the same factors | Results can go into Bursa / NSRF reporting | A1–A5 |
| **164 automated tests** run on every change (`npx vitest run`) | Nothing silently breaks | all |

**What this does NOT prove:** that the learned factors or savings are right for a specific real
plant. That needs that plant's heat log. See [accuracy-and-validation.md](accuracy-and-validation.md), section 4.
