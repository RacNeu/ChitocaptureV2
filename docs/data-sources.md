# Data used in ChitoCapture, and where it comes from

This lists every number the app runs on: in the melt shop (induction furnaces, the most important
part), the machines list, Site 3D and the 3D simulation. For each one it says **where it comes from**
and **why it is there**: to make the demo look and behave like a real plant, or to test that the
calculations work.

Companion documents:
- [calculations.md](calculations.md): the formulas that use this data.
- [accuracy-and-validation.md](accuracy-and-validation.md): how accurate the results are, with proof.
- [induction-furnace-model.md](induction-furnace-model.md): the full list of published induction-furnace figures, with page references.

## How to read the labels

| Label | Meaning |
|---|---|
| **Published** | Taken from a named public source (report, standard, regulator, utility). The source is given. |
| **Physics** | Worked out from textbook physics (heat, radiation, energy balance). The working is in [calculations.md](calculations.md). |
| **Tuned** | Chosen by us so the model's output matches published measurements. It isn't measured directly. |
| **Assumption** | A sensible placeholder with no single source (a price, a cycle time). It is editable, and the app tags it as an assumption. |
| **Demo** | Made-up plant data, shaped to look like a real Masteel-sized melt shop. It is clearly labelled "Demo" in the app and is never mixed with uploaded data. |

| Purpose | Meaning |
|---|---|
| **① Demo** | It is there so the pitch looks and behaves like a real plant. |
| **② Test** | It is there so we can prove a calculation works: the right answer is known in advance and the test checks that the app finds it. |

---

## 1. Melt shop: induction furnaces + ladle furnace (most important)

The route is **scrap → coreless induction furnace (IF) → ladle furnace (LF) → caster**. Masteel
(Malaysia Steel Works (KL) Bhd) has run this route since 2021, and so do many Malaysian long-steel mills.

### 1.1 Real plant reference (Masteel)

| Fact | Value | Label | Source |
|---|---|---|---|
| Furnace type and size | 60 t induction furnaces, fully induction since 2021 (replaced the EAF after a 4-year revamp) | Published | GEM Wiki (Global Energy Monitor), *Malaysia Steel Works Klang*; masteel.com.my sustainability page |
| Capacity | ~800 kt/yr crude steel (nominal) | Published | GEM Wiki |
| Billets go straight to rolling | Direct charging, no reheating-furnace gas | Published | masteel.com.my sustainability page |
| Steelmaking plant emissions | 0.489 t CO₂e/t (FY2024), 0.456 (FY2025) | Published | Masteel Sustainability Report FY2024; Masteel sustainability page (FY2025) |
| Rolling mill emissions | 0.112 t CO₂e/t (FY2024), 0.085 (FY2025) | Published | same |
| Energy and GHG tables FY2022–FY2024 | Electricity, natural gas, diesel, Scope 1 and 2 | Published | Masteel Sustainability Report FY2024, pp. 50–51 and 152 |
| Number of furnaces, power supplies, LF details | **Not published** | — | The demo uses 4 × 60 t IF + 1 LF and says it is illustrative |

**Purpose:** ① sizes the demo plant. ② The FY2022–FY2024 energy and GHG tables are the main real-world check (see §5 and [accuracy-and-validation.md](accuracy-and-validation.md)).

### 1.2 Furnace HMI simulator: default set points (Melt shop → Furnace HMI)

These are the values the HMI opens with. The user can change every one of them.
Code: `src/model/furnaceSim.ts` → `defaultSetPoints`.

| Set point | Default | Label | Why this value |
|---|---|---|---|
| Power set point | 31 MW | Assumption | 60 t furnaces typically take ~30–35 MW; it gives ~75 min power-on, inside the 45–90 min a 60 t heat takes |
| Converter rating | 33 MW | Assumption | A little headroom above the set point |
| Charge | 60 t | Published | Masteel furnace size |
| Liquid heel | 0 t | Assumption | Simplest case; the user can add a heel |
| Scrap mix | HMS 44%, shredded 30%, turnings 15%, pig iron 4%, own returns 7%, DRI 0% | Assumption | A typical Malaysian rebar mill mix; no plant publishes theirs |
| Tap aim | 1,620 °C | Assumption | Normal tap temperature for rebar billets (1,600–1,650 °C) |
| Holding time | 14 min | Assumption | Mid-range waiting time for LF/caster |
| Extra lid-open time | 6 min | Assumption | Sampling, temperature readings and additions, once the bath is liquid |
| Coil water flow / inlet | 410 m³/h, 32 °C | Physics + assumption | Sized so the coil water can carry ~26% of 31 MW at a ~17 °C rise: 31 MW × 0.26 ≈ 8 MW = 410 m³/h × 4.18 × 17 °C. 32 °C is a typical Malaysian cooling-tower supply |
| Electricity price | RM 424/MWh | Published | Average of TNB HV ToU peak 44.52 and off-peak 40.43 sen/kWh (see §4.2) |
| Grid factor | 0.774 kg CO₂/kWh | Published | Energy Commission, Peninsular Malaysia, 2022 |

**Purpose:** ① the HMI shows a realistic 60 t heat. ② The tests run it and check the result is inside published ranges.

### 1.3 Furnace HMI simulator: physics constants

Code: `src/model/furnaceSim.ts`. The full sources are in [induction-furnace-model.md](induction-furnace-model.md).

| Constant | Value | Label | Source / reason |
|---|---|---|---|
| Energy to melt steel and bring it to 1,600 °C | 389 kWh/t | Physics + Published | Steel enthalpy ≈ 1.40 GJ/t. Missouri S&T / US DOE (OSTI 1051407) measured 386–397 kWh/t |
| Energy to raise liquid steel 1 °C | 0.23 kWh/t·°C | Published + Physics | CTC-N Thailand benchmarking §4.4.2; c_p ≈ 0.82 kJ/kg·K |
| Power supply efficiency | 97% | Published | US DOE (Schifo 2004): > 96% for large furnaces |
| Copper coil loss | 24% of converter output | Tuned | Set so the coil water (copper loss + lining conduction) carries 26% of the heat's electricity, as DOE measured (26–29%) |
| Lining conduction loss when hot | 700 kW (scaled by furnace size^⅔) | Tuned | Set so total losses and kWh/t land in the published range |
| Bath emissivity | 0.4 | Physics | Typical for liquid steel with some slag |
| Open bath area | 4.15 m² for 60 t | Physics | 60 t ÷ 7 t/m³ ≈ 8.6 m³ in a ~2.3 m diameter crucible |
| Lid closed keeps in | 85% of radiation | Assumption | Lid is insulated but not sealed |
| Before the scrap melts, radiation | 35% of open-bath value | Assumption | Solid scrap is cooler and partly covered |
| Charging / tapping time | 10 min / 6 min | Assumption | Typical bucket charge and tilt-pour times |
| Metal yield | 95.5% − 6% × turnings share | Assumption | Light, rusty scrap loses more as oxide and slag |
| Rusty / light scrap | +30 kWh/t (scaled by turnings share) | Published (vendor) | Otto Junker / Foundry Management & Technology |
| Dense shredded scrap | −15 kWh/t (scaled by shredded share) | Published (secondary) | BEE India: 15–20 kWh/t |
| Cold lining | lining absorbs 75 kWh/t, which costs ~+111 kWh/t of electricity | Tuned to Published | Missouri S&T / DOE: cold vs hot-lining heats differ by +105 to +119 kWh/t |
| Alarm limits | Flow < 300 m³/h, outlet > 55 °C, ΔT > 20 °C, bath > aim + 25 °C | Assumption | Example set points. A real furnace uses its maker's limits |
| Grid side | 33 kV feed, cos φ 0.98 when on | Published (vendor) + Assumption | IGBT supplies run at ~0.98–1.0 (Otto Junker, Kintek). 33 kV is a typical Malaysian HV feed |
| Coil voltage, current, DC link, frequency | 3,000 V at rating, coil p.f. 0.12, 1,800 V DC, 250 → 205 Hz as the bath melts | Assumption | Shown for realism only. **Indicative, not used in any energy or CO₂ figure** |

### 1.4 Demo melt shop dataset (Melt shop pages, Material & yield, Carbon)

Code: `src/model/meltshopDemo.ts`. **Demo.** It is generated the same way every time (fixed random
seed) and never saved, so it can't be mistaken for uploaded data.

**Shape (① Demo):**
- 4 × 60 t induction furnaces on 2 shared power supplies (IF1/IF2 and IF3/IF4: one melts while the other holds and taps), 1 ladle furnace.
- October 2026, **1,231 heats**, ~66,600 t tapped (≈ 65 kt/month ≈ 790 kt/yr, Masteel's scale).
- Charge 52–62 t per heat. Scrap shares vary per heat: shredded 15–45%, turnings 4–25%, pig iron 0–8%, own returns 4–10%, HMS the rest.
- Power 29–33 MW. Holding 6–22 min (+7 min on night shift, 5% of heats wait 20–50 min longer). Lid open 3–9 min. Tap 1,622 ± 10 °C (+8 °C at night).
- LF: energy from 0.23 kWh/t·°C ÷ 17% LF heating efficiency (CTC-N), giving ~33–70 kWh/t. Electrodes 0.28–0.45 kg/t, lime 7–11 kg/t, alloys 8–11 kg/t, alloy carbon 0.25–0.4 kg/t, ladle preheat 0.25–0.45 GJ/t (CTC-N: 0.19–0.90 GJ/t).
- Chemistry for every heat (C, Mn, Si, S, P, Cu, Cr, Ni, Mo, V, Sn, N), mostly inside BS 4449 limits. Grade B500B (80%) or B500A.
- One reading a minute for the last 48 hours on every furnace: kW, bath °C, coil water in/out, flow, Hz.

**Built-in answers (② Test).** These are the "true" effects we put in on purpose. The tests check that the app finds them again from the heats alone:

| Built-in effect | Value | Based on |
|---|---|---|
| Base | 500 kWh/t | Otto Junker good practice 500–560 kWh/t |
| Holding | +0.35 kWh/t per minute | Otto Junker ~275 kW thermal loss, 15 t furnace |
| Lid open | +0.6 kWh/t per minute | Otto Junker: 20 min ≈ +15 kWh/t |
| Tap temperature | +0.4 kWh/t per °C above 1,620 | Otto Junker: 20 kWh/t per 50 K |
| Cold lining | +100 kWh/t | Missouri S&T / DOE |
| Shredded share | −15 kWh/t per 100% | BEE India |
| Turnings share | +30 kWh/t per 100% | Otto Junker |
| Furnace fill | −60 kWh/t per 100% | Assumption (DOE: schedule full heats) |
| IF4 (older coil) | +15 kWh/t | Assumption: one furnace worse than the others |
| Random noise | ± 10 kWh/t (1 σ) | So the data is not perfect |
| Copper per scrap type | HMS 0.26%, shredded 0.17%, turnings 0.34%, pig iron 0.01%, returns 0.14%, DRI 0.005% | Assumption, typical of mixed scrap |

**Built-in events (② Test):**
- Sunday 08:00–14:00 maintenance stops, so the next heat on each furnace starts on a cold lining.
- New lining on IF2 on 12 October.
- IF3 coil-water flow falls on the last afternoon (flow −140 m³/h over an hour, ΔT climbing). The anomaly detector must catch it.
- IF1's coil-water ΔT creeps up ~0.5 °C a day over the last 48 hours, like scale building up. The Risks page must forecast it reaching 20 °C in about 4–5 days.
- Linings at different ages (IF1 349, IF2 198 after its reline, IF3 377, IF4 401 heats). The Risks page uses a **demo setting** of 450 heats as the usual lining life; a real plant enters its own.
- A few heats over the copper / carbon / CEV limits. The chemistry check must flag them.

### 1.5 Live data & alerts feed (Settings → Live data & alerts, HMI Live mode)

Code: `src/live/feed.ts`. **Demo.** It is a virtual plant that streams one reading per furnace per plant-minute.

| Item | Value | Label |
|---|---|---|
| Heat profile | From the HMI simulator above. Each furnace has slightly different power (30–31.2 MW), charge (58–61 t) and holding (12–18 min). Pairs are offset by half a heat | Physics + Assumption |
| Coil water | 410 ± 5 m³/h, inlet 32 ± 0.4 °C, outlet from the coil heat (Q = ṁ·c·ΔT) | Physics |
| Earth-leakage current | 3 ± 0.8 mA normally | Assumption |
| Demo faults | Coil leak (flow −4%/min, to −60%), pump trip (flow × 0.32), lining wear (leakage +1.6 mA/min, to +32 mA), bath overheating (+4 °C/min, to +55 °C) | Assumption: shaped like the real failure |
| Alert limits | Flow < 300, outlet > 55 °C, ΔT > 20 °C (warn), leakage > 15 mA warn / > 25 mA alarm, bath > aim + 30 °C | Assumption. Example limits; the coil maker sets real ones |

**Purpose:** ① shows alerts and Telegram messages arriving. ② `src/live/feed.test.ts` checks that a pump trip, a coil leak and lining wear on IF2 each raise the right alarm, at most once (a warning may escalate to an alarm), with no alarm on the other furnaces. It also checks that 4 hours of healthy running raise no alarm and fewer than 3 warnings. The bath-overheating fault has no test yet.

When the source is **Supabase cloud**, readings come from devices (or the test publisher) through the
`ingest` Edge Function instead. The format and the alert rules stay the same.

### 1.6 Melt shop settings and prices (editable)

Code: `src/model/meltshop.ts` → `defaultMelt`, `gradeLimits`.

| Item | Value | Label | Source |
|---|---|---|---|
| Tap target | 1,620 °C | Assumption | Typical rebar practice |
| TNB energy, HV ToU | 44.52 sen/kWh peak, 40.43 off-peak | Published (consultancy) | trexon.my, plusxnergy guides to the July 2025 tariff (not seen on the official page) |
| TNB demand charge, HV ToU | RM 21.76 + 23.06 per kW·month (capacity + network) | Published | myTNB tariff page |
| Peak hours | Mon–Fri 14:00–22:00 | Published | myTNB |
| Electrode price / carbon | RM 22/kg, 99% C | Assumption | Graphite electrode, typical |
| Scrap prices | HMS RM 1,550/t, shredded 1,700, turnings 1,300, pig iron 2,100, returns 1,500, DRI 1,900 | Assumption | Indicative; replace with the plant's purchase prices |
| Rebar limits (B500A/B/C) | C 0.22, S 0.050, P 0.050, N 0.012, Cu 0.80, CEV 0.50 (max %, cast) | Published | BS 4449:2005 (basis of MS 146). Unofficial copy; confirm against the purchased standard |

### 1.7 Import templates

`TEMPLATES` in `src/model/meltshop.ts` gives one example row each for heats, chemistry and readings.
It is **Demo** data, there only to show the column names a plant needs.

---

## 2. Sample steel mini-mill: machines, Site 3D and 3D simulation

One model feeds all three, so they always agree. Code: `src/model/steel.ts` (`defaultSteelParams`) and
`src/model/templates.ts`. **It is a sample plant, not any real one.** When a plant uploads its bills,
the machine list is rescaled to match them (`src/model/calibration.ts`).

### 2.1 Mill parameters

| Item | Value | Label | Reason / source |
|---|---|---|---|
| Heat size | 57 t tapped | Physics | 60 t charge × ~95% yield |
| Shop tap-to-tap | 34 min (all 4 furnaces together) | Tuned | Gives ~795 kt/yr, Masteel's nominal ~800 kt |
| Operating hours | 7,900 h/yr | Assumption | ~90% of the year |
| Annual steel | **794,647 t** | Result | 57 t × 60/34 × 7,900 |
| Induction furnaces | 520 kWh/t | Tuned + Published | Inside Otto Junker's 500–560 good practice; near the best DOE trial (473 kWh/short ton ≈ 521 kWh/t). Chosen so the melt shop matches Masteel's published 0.456–0.489 t CO₂e/t |
| Ladle furnace | 40 kWh/t | Published | CTC-N benchmark 33–70, average 45 |
| Caster | 15 kWh/t | Assumption | Planning placeholder |
| Rolling mill | 100 kWh/t | Assumption | Placeholder. Masteel's figures imply ~110–150 kWh/t, so this is low |
| Fume extraction | 20 kWh/t | Assumption | Placeholder |
| Cooling water and compressed air | 30 kWh/t | Assumption | Placeholder |
| Reheating furnace gas | 1.2 GJ/t | Assumption | Typical gas-fired billet reheating (Masteel itself burns none: direct rolling) |
| Melt-shop direct CO₂ | 22 kg/t | Physics + Published | LF electrodes ~0.35 kg/t × 99% C × 44/12 ≈ 1.3, alloy carbon ≈ 1.2, ladle preheat 0.35 GJ/t × 56.1 ≈ 19.6 |
| Grid factor | **0.74** kg/kWh | Published | Single Buyer 2024 figure for Peninsular Malaysia. ⚠ The rest of the app defaults to 0.774 (Energy Commission 2022); see the accuracy doc |
| Gas factor | 56.1 kg CO₂/GJ | Published | IPCC 2006 |
| Electricity / gas price | RM 450/MWh, RM 40/GJ | Published / Assumption | TNB July 2025 (≈ RM 0.45/kWh all-in); no public industrial gas price exists |

### 2.2 Machines list (Machines page, Site 3D labels)

Each machine's yearly energy is its kWh/t × 794,647 t, so every page shows the same numbers:

| Machine | Yearly use | Target per tonne |
|---|---|---|
| Induction furnaces (4 × 60 t) | 413,216 MWh | 500 kWh/t (Otto Junker low end) |
| Ladle furnace | 31,786 MWh + 17,482 t direct CO₂ | 35 kWh/t (better half of CTC-N) |
| Fume extraction fans | 15,893 MWh | 15 kWh/t (placeholder) |
| Continuous caster | 11,920 MWh | 12 kWh/t (placeholder) |
| Reheating furnace | 953,576 GJ natural gas | 1.0 GJ/t (placeholder) |
| Rolling mill | 79,465 MWh | 85 kWh/t (placeholder) |
| Cooling water & compressed air | 23,839 MWh | 25 kWh/t (placeholder) |

Every machine is marked "estimated" until the plant enters metered figures.

### 2.3 Upgrades (3D simulation sandbox, and the Plan)

| Upgrade | Saving | Cost | Label |
|---|---|---|---|
| Induction melting best practice | −6% furnace electricity | RM 0.8m | Published (DOE trial: 5–10% hot linings, 15% first heats) + Assumption (cost) |
| IGBT power supplies | −5% furnace electricity | RM 12m | Published (vendor claims 5–25%; we use the low end) + Assumption (cost) |
| Variable-speed fume fans | −20% fan electricity | ~2 years of saving | Assumption |
| Hot charging | −30% reheating gas | RM 15m | Assumption |
| Regenerative burners | −15% reheating gas | RM 20m | Assumption |
| Green electricity | Grid CO₂ × (1 − green share), +3 sen/kWh | — | Published (TNB GET premium, 3-year rate) |

### 2.4 3D simulation heat cycle

Code: `liveState()` and `meltInternals()` in `src/model/steel.ts`.

| Item | Value | Label |
|---|---|---|
| Phase shares of the 34 min shop cycle | Charging 12%, melting 66%, holding 14%, tapping 8% | Assumption |
| Relative shop power by phase | 0.6, 1.15, 0.75, 0.6 | Assumption. Paired furnaces take turns, so shop power swings less than one furnace's |
| Rolling mill | Stops 12 min in every 2 h for roll changes | Assumption |
| Bath temperature and coil-water ΔT shown in the 3D view | 1,250 → 1,620 °C; ΔT 17 °C melting, 5 holding, 3 idle | Assumption (illustrative animation) |

The averages are tied to the annual model. Averaged over a cycle, the 3D simulation draws the same power as the annual figure (72.97 MW vs 72.93 MW), and furnace power peaks at 61.7 MW, inside the two 31 MW supplies.

### 2.5 Site 3D

The 3D hall (`src/three/steelHall.ts`, `campus.ts`) is an **original, simplified layout** drawn in
code: scrap → furnaces → LF → caster → reheat → rolling → cooling bed, with a substation and gas
station outside. It is not a copy of any real plant's layout and is not to scale. The numbers shown
on it come from the machines list in §2.2.

---

## 3. The other sample sites

**Wire & galvanising plant** (`src/model/galv.ts`): 150 kt/yr of wire, 4 galvanising lines × 40 strands,
5.5 → 2.5 mm in 8 dies, coating 265 g/m² (spec 240), zinc 3.5 kg CO₂/kg (International Zinc
Association), drawing energy checked against Suliga et al. (*Materials*, 2023). Most line settings are
assumptions; the physics method is explained in [calculations.md](calculations.md).

**Head office**: four round-number machines (office tower 1,800 MWh, air-conditioning 2,600, server
room 900, diesel genset 1,200 GJ). **Assumption**, there only so the company view has more than one site.

**Sample monthly history** (`sampleHistory` in `src/model/history.ts`): **test fixture only, never
shown in the app.** It is 36 synthetic months with seasonality (Hari Raya and year-end dips), growth,
a −4% efficiency programme from month 15, 10% green electricity from month 25, and one faulty month
(+18% electricity). **② Test:** the forecast, baseline and findings tests must spot the fault month and the saving.

---

## 4. Malaysia-wide data (used everywhere)

### 4.1 Emission factors

| Item | Value | Source |
|---|---|---|
| Grid, Peninsular | 0.774 kg CO₂/kWh | Energy Commission (Suruhanjaya Tenaga), *Grid Emission Factor in Malaysia*, 2022; used by Bursa's GHG calculator |
| Grid, Sabah / Sarawak | 0.525 / 0.199 | same |
| Natural gas / diesel / fuel oil / coal | 56.1 / 74.1 / 77.4 / 94.6 kg CO₂/GJ | IPCC 2006 Guidelines, default stationary combustion CO₂ |
| Biomass | 0 (biogenic CO₂ reported separately) | GHG Protocol |
| Carbon → CO₂ | × 44/12 | Molecular weights; CBAM Implementing Regulation (EU) 2023/1773 |

### 4.2 Prices and policy

| Item | Value | Label / source |
|---|---|---|
| Electricity (general) | RM 450/MWh | TNB MV tariff from 1 July 2025: 29.83 sen/kWh + RM 89.27/kW MD ≈ RM 0.45/kWh at 80% load factor |
| TNB Green Electricity Tariff premium | 3 sen/kWh (3-year) | TNB, from 1 July 2025 |
| Gas | RM 40/GJ | Assumption: no public industrial price |
| Malaysian carbon tax | No confirmed rate. The calculator uses Singapore's path: S$25 (2024–25), S$45 (2026–27), S$50–80 by 2030, at RM 3.30/S$ | Singapore Carbon Pricing Act (as amended 2022); Budget 2026 named iron & steel first |
| EU carbon price | €90/t | EUA price, 13 Nov 2026 |
| € to RM | 4.53 | ECB reference rate, 11 Nov 2026 |
| CBAM phase-in | 2.5% (2026) → 100% (2034) | EU published schedule, simplified |
| Zinc | RM 15,300/t | LME cash ~US$3,760 × RM 4.08 |
| EECA energy threshold | 21,600 GJ/yr | Energy Efficiency and Conservation Act 2024 (Act 861) |

---

## 5. Summary: what is there for the demo and what is there to test

| Data | ① Demo | ② Test / validate | Real or made up |
|---|---|---|---|
| Masteel FY2022–FY2024 energy and GHG tables | | ✔ Our Scope 1/2 maths must reproduce their reported tonnes | **Real** (published) |
| Masteel steelmaking and rolling intensities | | ✔ The sample mill must land within 5% | **Real** (published) |
| Published induction figures (DOE, Otto Junker, CTC-N) | | ✔ The HMI simulator must land inside them | **Real** (published) |
| HMI simulator defaults | ✔ | ✔ | Physics + assumptions |
| Demo melt shop (1,231 heats) | ✔ | ✔ The app must recover the built-in effects and copper values | **Made up**, labelled Demo |
| IF3 coil-water fault in the demo readings | ✔ | ✔ The anomaly detector must catch it, with no false alarms elsewhere | **Made up** |
| Live feed and demo faults | ✔ | ✔ Each fault raises its alert once | **Made up** |
| Sample steel mill, machines, Site 3D, 3D simulation | ✔ | ✔ Tests check annual totals, power limits and that 3D = annual | Tuned to Masteel + assumptions |
| Sample monthly history | | ✔ The forecast and findings must find the fault month | **Made up**, test only |
| Malaysian factors and tariffs | ✔ | ✔ | **Real** (published) |
| Upgrade costs, scrap and electrode prices | ✔ | | Assumptions, editable |
