# Is ChitoCapture accurate? Validation and proof

*Run on 18 November 2026 against the code on branch `refocus-scope-dashboard`. Every number below
comes from running the app's own functions; section 6 shows how to reproduce them.*

## Short answer

ChitoCapture has no industry partner yet, so we can't show "a plant used it and saved X". What we
**can** show is accuracy at three levels. Each level is proven in a different way:

| Level | Question | Answer | Proof |
|---|---|---|---|
| **1. Carbon accounting** | Given real energy data, are the Scope 1 and 2 tonnes right? | **Yes, exactly** | Reproduces Masteel's published Scope 2 for FY2022, FY2023 and FY2024 to 0.000% |
| **2. Physics model** | Does the furnace simulator behave like a real 60 t induction furnace? | **Yes, within published ranges** | 589 kWh/t, with 66% of the electricity into the steel and 26% into the coil water, all inside DOE's measured heats |
| **3. Learning from a plant's data** | Given a plant's heat log, does the app find the true causes of wasted energy? | **The method is proven; it has not been tried on a real plant's data** | On test data with known answers it recovers 7 of 7 effects, the copper of every scrap type and the injected coil-water fault |

**Honest summary for a pitch:** the carbon numbers are as accurate as the data put in, because they
use the same standards and factors as a listed Malaysian steelmaker and reproduce its report. The
furnace physics is realistic. The savings figures are **estimates until a plant's own heats are
loaded**, and the app says so on screen.

---

## 1. Level 1: carbon accounting reproduces a real company's report

**Test:** take Masteel's published electricity and fuel use (Sustainability Report FY2024, pp. 50–51
and 152), run it through the exact function the dashboard uses (`scopesFor`), and compare with the
tonnes Masteel reported. Each year uses the grid factor Masteel used that year.

| Year | Grid factor used | Our Scope 2 (t CO₂e) | Masteel reported | Difference |
|---|---|---|---|---|
| FY2022 | 0.585 (2017 CDM baseline) | 223,346 | 223,345.52 | **0.000%** |
| FY2023 | 0.758 (Energy Commission 2021) | 325,057 | 325,057.23 | **0.000%** |
| FY2024 | 0.774 (Energy Commission 2022) | 308,401 | 308,400.88 | **0.000%** |

| Year | Our diesel Scope 1 | Masteel reported | Difference | Why |
|---|---|---|---|---|
| FY2024 | 1,601.8 t | 1,622.61 t | **−1.3%** | We use the IPCC CO₂-only factor; Masteel used US EPA factors that also count CH₄ and N₂O |
| FY2023 | 1,626.9 t | 1,505.08 t | +8.1% | Masteel changed method between years; kept as a test so a change is noticed |

**Also checked:** Masteel's electricity in GJ (energy table) equals its kWh in the text × 3.6, so we
read the right number.

**What this proves:** our units, conversions, factors and Scope 1/2 split match how a Bursa-listed
steelmaker reports. **What it does not prove:** Scope 2 is a multiplication, so this checks that we do
it the standard way. It doesn't check any prediction.

---

## 2. Level 2: the furnace physics matches published measurements

### 2.1 One 60 t heat at the default set points (Furnace HMI)

| Result | Simulator | Published | Source | Verdict |
|---|---|---|---|---|
| Electricity per tonne | **589 kWh/t** | 584–661 typical (530–600 kWh/short ton); 521–734 in DOE's measured heats; 500–560 good practice | US DOE (Schifo 2004); Missouri S&T / DOE (OSTI 1051407); Otto Junker | ✔ inside typical; above good practice because the defaults include 14 min holding and 6 min lid open |
| Share of electricity that ends up in the liquid steel | **66%** | 54–71% measured | OSTI 1051407 Sankey diagrams | ✔ |
| Share carried away by the coil cooling water | **26%** | 26–29% measured | OSTI 1051407 | ✔ |
| Coil water temperature rise while melting | 16.6 °C at 410 m³/h | ~17 °C (26% of 31 MW at that flow) | Physics: Q = ṁ c ΔT | ✔ |
| Power-on time | 78 min (94 min tap-to-tap) | 45–90 min expected for 60 t at ~31 MW | Physics: 589 kWh/t × 57 t ÷ 31 MW ≈ 65 min + holding | ✔ |
| Liquid steel energy | 389 kWh/t (input) | 386–397 kWh/t measured | OSTI 1051407 | ✔ |

### 2.2 Does each set point move the result the way physics says?

| Change | Simulator | Published | Verdict |
|---|---|---|---|
| Hold 30 min instead of 14 | +5.6 kWh/t (0.35/min) | ~0.3/min (275 kW loss, Otto Junker) | ✔ |
| Tap at 1,650 °C instead of 1,620 | +8.8 kWh/t (0.29/°C) | 0.23 (into steel) to 0.4 (from grid) per °C | ✔ |
| Cold lining | +111 kWh/t | +105 to +119 kWh/t (DOE heats and trial) | ✔ |
| Lid open 20 min vs 0 | +0.40 kWh/t per min | 0.3–0.9 per min (Otto Junker; radiation physics) | ✔ low end |
| Half power | higher kWh/t, power-on ≥ 1.6× | higher kWh/t at part power (Otto Junker) | ✔ |
| Coil water flow 220 m³/h | coil-water alarm | low coil-water flow is a known coil-failure risk | ✔ |

### 2.3 Sample steel mill vs Masteel's published intensities

| Part of the mill | Ours (t CO₂e/t) | Masteel FY2024–25 average | Difference |
|---|---|---|---|
| Steelmaking (induction furnaces to caster) | 0.484 | 0.473 | **+2.5%** |
| Rolling mill, electricity only | 0.074 | 0.099 | −25% |
| Whole mill without reheating gas | 0.558 | 0.571 | **−2.2%** |
| Whole mill with gas reheating | 0.626 | 0.70 (world scrap-EAF average, worldsteel via IRENA) | −11% (not like-for-like) |

⚠ **Be careful with this one in a pitch.** We **tuned** the sample mill's 520 kWh/t so the
steelmaking figure would land near Masteel's. So the +2.5% shows the sample is realistic; it is
**not** an independent prediction. The independent evidence is that 520 kWh/t also sits inside Otto
Junker's 500–560 range and next to DOE's best trial (521 kWh/t), and that the rest of the mill comes
out within 2.2% without further tuning.

---

## 3. Level 3: the learning methods find known answers

We built a demo melt shop (1,231 heats, October 2026) with effects we put in on purpose, then asked
the app to find them from the heats alone, the same way it would for a real plant's log.

### 3.1 Energy factors (Melt shop → Energy & thermal)

| Effect | True (built in) | App found | 90% range | Inside? |
|---|---|---|---|---|
| Holding, per min | 0.35 | 0.33 | 0.28 – 0.39 | ✔ |
| Lid open, per min | 0.60 | 0.44 | 0.16 – 0.72 | ✔ |
| Tap temperature, per °C | 0.40 | 0.36 | 0.31 – 0.42 | ✔ |
| Cold lining, per heat | 100 | 95.9 | 91.7 – 100.1 | ✔ |
| Shredded share | −15 | −13.5 | −19.7 – −7.3 | ✔ |
| Turnings share | +30 | +25.4 | +16.5 – +34.2 | ✔ |
| Furnace fill | −60 | −63.4 | −74.6 – −52.3 | ✔ |

**7 of 7** true values lie inside the app's 90% ranges. The fit explains 60% of the heat-to-heat
variation (R² = 0.60), with an 11.6 kWh/t typical error. That is close to the ±10 kWh/t random noise
we added, so the model has found nearly everything that can be found.

### 3.2 Copper from each scrap type (Material & yield)

| Scrap | True Cu % | App found |
|---|---|---|
| HMS | 0.26 | 0.261 |
| Shredded | 0.17 | 0.172 |
| Turnings | 0.34 | 0.339 |
| Pig iron | 0.01 | 0.000 (clamped at zero) |
| Own returns | 0.14 | 0.146 |

All within 0.01 percentage points. The chemistry check flags the 5 heats we deliberately pushed
over a BS 4449 limit.

### 3.3 Coil-water fault (HMI F3, Live data)

The demo readings hold 4 furnaces × 48 hours at one reading a minute (~11,500 readings). One fault
is injected: IF3's flow falls by 140 m³/h between 18:28 and 19:28 on 31 October.

| | Result |
|---|---|
| Fault flagged? | **Yes**: 4 flags on IF3 (ΔT at 18:36, flow at 18:42, flow at 19:13, ΔT at 19:14) |
| First flag | 8 minutes after the fault began (coil-water ΔT), while flow was still ~390 m³/h, well above the fixed 300 limit |
| False alarms anywhere else | **0** |

The anomaly check therefore caught the fault before a fixed limit would have.

### 3.4 Live alert engine

Tests (`src/live/feed.test.ts`):
- A pump trip, a coil leak and lining wear on IF2 each raise the correct alarm.
- Each alert is raised at most once (a warning may escalate to an alarm), and no alarm appears on the other furnaces.
- 4 hours of healthy running raise **no alarm** and fewer than 3 warnings.

---

## 4. What is not proven, and the problems we found

Being upfront about these makes the rest more believable.

| # | Issue | Effect | Severity | Fix |
|---|---|---|---|---|
| 1 | **No real plant's heat log yet** | Level 3 is proven on test data only. Real data is messier (missing fields, meter drift) | High, for savings claims | Get one plant's anonymised heat log (even 2–3 months) and compare predicted vs actual kWh/t on heats the model hasn't seen |
| 2 | ~~Coil-water share 21% vs DOE 26–29%~~ | **Fixed 18 Nov 2026:** coil copper loss 20% → 24%; now 26% | — | Test holds it at 25–30% |
| 3 | ~~Lid-open set point had no effect~~ | **Fixed:** the lid is now open while the bath is liquid; +0.40 kWh/t per min | — | Test holds it at 0.3–0.9 |
| 4 | ~~Cold lining +139 vs DOE +105–119~~ | **Fixed:** the lining absorbs 75 kWh/t; now +111 kWh/t | — | Test holds it at +100–125 |
| 5 | Sample mill rolling is 100 kWh/t; Masteel implies ~110–150 | Rolling-mill CO₂ 25% low | Low (sample only; bills replace it) | Raise to ~130 kWh/t |
| 6 | Sample mill matches Masteel partly because it was tuned to | Can't be quoted as an independent prediction | Presentation | Quote the Level 1 test and the DOE ranges instead |
| 7 | Two grid factors: 0.774 (Energy Commission 2022) in most of the app, 0.74 (Single Buyer 2024) in the sample mill | Sample-mill Scope 2 is 4% lower than the dashboard default would give | Low | Use one default everywhere and show the other as an option |
| 8 | Simulator steps are 15 s; at 31 MW one step is ~2.3 kWh/t | Very small set-point changes (e.g. 1 min of lid) can show no change | Low | Finish the last step fractionally |
| 9 | Carbon tax rate, IGBT savings, upgrade costs, scrap prices | Estimates, not facts | Shown as ranges and labelled | Replace with quotes and announcements as they arrive |
| 10 | BS 4449 limits read from an unofficial copy | Limits could differ slightly | Low | Check against the purchased standard |

---

## 5. How to get stronger proof without an industry partner

1. **Out-of-sample public data.** Run the same method, with no re-tuning, on other Bursa-listed steelmakers' sustainability reports, and publish the error. A model that predicts reports it was not tuned on is much stronger evidence than item 2.3.
2. **Re-run the DOE trial.** The Missouri S&T / DOE report (OSTI 1051407) gives measured heats: cold lining 653, hot lining with heel 545, improved practice 517–519 kWh/short ton. Set the simulator to those furnace sizes and conditions and compare.
3. **Bench test the sensor path.** An ESP32 with a flow meter and two temperature probes on a heated water loop: measure the heater's kW with a plug meter and check that Q = flow × 4.18 × ΔT matches it. That proves the live coil-loss reading end to end.
4. **Expert review.** Ask a metallurgy or energy lecturer (or a TNB / SEDA energy auditor) to review [calculations.md](calculations.md). A signed review is credible proof for a pitch.
5. **Formal verification later.** For real reporting, a third party verifies GHG statements under ISO 14064-3. The app's Scope 1/2 method is already the one they check (Level 1).

---

## 6. Reproduce these results

```bash
npx vitest run
```

This runs all 155 tests. The ones behind this document:

| Claim | Test file |
|---|---|
| Masteel Scope 1/2 reproduction | `src/model/validation.test.ts` |
| Sample mill vs Masteel within 5% | `src/model/malaysia.test.ts` |
| Simulator in the published range; set points move it the right way | `src/model/furnaceSim.test.ts` |
| Learned factors, copper, chemistry, IF3 anomaly | `src/model/meltshop.test.ts` |
| Live alerts: right alarm once, no alarms when healthy | `src/live/feed.test.ts` |
| ~800 kt/yr, power limits, 3D = annual, CBAM | `src/model/steel.test.ts` |
| Sandbox = Plan for every upgrade | `src/model/scenario.test.ts` |
| Bills calibration, baseline, forecast, findings | `calibration`, `baseline`, `history`, `findings` tests |

The exact figures in sections 2–3 (589 kWh/t, 66% / 26% split, +111, the factor table, the anomaly times) came
from a one-off script that calls the same functions (`simulateHeat`, `learnFactors`, `learnCopper`,
`findAnomalies`, `steelCrossCheck`, `checkMasteel`).
