# EAF optimisation model — how each factor works

Reference for the CarbonPath **Optimise** section (electric arc furnace route only). For every factor an EAF HMI shows, this lists what it is, how it moves energy, CO₂ and cost, the published numbers, and how confident we are. The app should show the basis and confidence next to every figure it derives from here.

**Confidence**
- **A**: physics or regulation (exact).
- **B**: consistent across several published studies.
- **C**: one study or a wide range; use as a starting value and **calibrate to the plant's own heats**.
- **P**: plant-specific; must be learned from the plant's data.

> Rule for the app: coefficients rated C or P are only defaults. As soon as a site uploads per-heat data, the app fits the plant's own coefficient by regression across its heats and shows "learned from your N heats".

---

## 1. The energy balance (what everything else is measured against)

A modern scrap EAF takes in roughly **650–850 kWh/t** of total energy (electrical + chemical). Only part of it ends up in the liquid steel.

| Output | Typical share | Typical kWh/t | Conf. |
|---|---|---|---|
| Liquid steel (sensible heat to ~1,600 °C) | 45–60% | ~390–400 | B |
| Off-gas (sensible + chemical: CO, H₂) | 11–35% | ~225–250 | B |
| Cooling water (panels, roof) | 8–29% | ~80–145 | B |
| Slag | 4–10% | ~50–70 | B |
| Electrical and radiation losses | 2–9% | — | B |

| Input | Typical share | Conf. |
|---|---|---|
| Electricity | 40–66% | B |
| Chemical (oxidation of C, Fe, Si, Mn; burners) | 20–50% | B |
| Burner fuel alone | 2–11% | B |

**App use:** for each heat, *electrical kWh/t* vs the plant's own best-heat benchmark, plus an estimated split of where the energy went. Wide ranges mean the split is shown as a range until the plant has off-gas or cooling-water measurements.

---

## 2. Electrical side (HMI: primary/secondary side, cos φ, taps, set points)

| Factor | How it works | Numbers | Conf. |
|---|---|---|---|
| **Active energy (kWh), specific energy (kWh/t)** | The headline. kWh/t = active energy ÷ tapped tonnes. | Scrap EAF typically ~350–450 kWh/t electrical | B |
| **Arc length / transformer tap** | Long arcs give more power but radiate to the walls unless covered by foamy slag. Uncovered long arcs waste energy and stress cooling panels. | Raising arc length 300→425 mm: arc efficiency −30%, specific power +25–30% (one study) | C |
| **Foamy slag cover** | Foam shields the arc so more heat goes to the bath. | ✅ Net saving **5–7 kWh/short ton (6–8 kWh/tonne)** after counting oxygen production (LBNL, from Adolph et al. 1990): small. ⚠ Arc efficiency 52–66% → 80–93% and the 730 → 640 kWh/t plant case could not be verified (sources blocked). Use the conservative LBNL figure. | B (verified, conservative) / C |
| **Power factor (cos φ), reactor tap** | Sets the operating point (current vs voltage) on the circle diagram. It trades power-in against arc stability and electrode wear. | No reliable general coefficient found | P |
| **Power-on time, power-off (delay) time** | During power-off the furnace keeps losing heat to walls, roof and off-gas, and must win it back. | No published kWh/t-per-minute figure; learn from the plant's heats | P |

**App use:** per-heat kWh/t, power-on and power-off minutes. "Delay energy" is learned per site as extra kWh/t per minute of power-off, by regression across heats.

---

## 3. Chemical energy (HMI: oxygen, natural gas, carbon, burners, lances)

| Factor | How it works | Numbers | Conf. |
|---|---|---|---|
| **Oxygen (Nm³/t)** | Oxidises carbon (and some Fe, Si, Mn) in the bath; the heat released replaces electricity. | ✅ **~3.5 kWh electricity per Nm³ O₂ on average**; ✅ ~5 kWh/Nm³ or more for the first 20–25 Nm³/t (burners + lancing); ✅ lancing alone (C→CO) **at most ~2 kWh/Nm³**; ✅ post-combustion **3–5 kWh/Nm³** (all Linde/InTech). ⚠ The often-quoted 2.5–4.4 kWh/Nm³ range could not be traced to a readable source. | B (verified) |
| **Cost of the oxygen itself** | Making oxygen uses electricity (on-site air separation plant). | ✅ **~0.5 kWh per Nm³ O₂** (LBNL, citing von Schéele 2006) | B (verified) |
| **Natural gas (oxy-fuel burners)** | Heats cold spots in the scrap early in the heat. | ✅ Wall-mounted lance-burner systems: **10–20 kWh/short ton (11–22 kWh/tonne)** and 2–5 min/heat shorter (LBNL). ⚠ 20–40 kWh/t for an optimised burner (MDPI 2020) not verified: site blocked. | B (verified) / C |
| **Charge and injected carbon (kg/t)** | Charge carbon gives chemical energy; injected carbon foams the slag and reduces FeO. Both become CO₂. | Example: 10–11 kg/t injected carbon (one plant) | C |

**CO₂ from chemical inputs (exact):**
- Carbon → CO₂: **× 44/12 = 3.664 kg CO₂ per kg C**, times the carbon's C content.
- Natural gas: CO₂ from its carbon. The app uses 56.1 kg CO₂/GJ (IPCC, net calorific value); convert Nm³ with the supplier's calorific value. **Watch gross vs net calorific value: bills are often on a gross basis.**

**App use:** O₂ Nm³/t, gas Nm³/t and carbon kg/t per heat. The plant's own kWh-per-Nm³ is learned by regression and compared with the 2.5–4.4 kWh/Nm³ published band. The net benefit counts the oxygen plant's own 0.5 kWh/Nm³.

---

## 4. Electrodes

| Factor | How it works | Numbers | Conf. |
|---|---|---|---|
| **Tip consumption** | Sublimation at the arc (~3,000 °C). Tip rate (kg/h) correlates with current² ÷ power (I²/P) in data from 20 furnaces; converted to kg/t with power-on time (LMM 2021). | ⚠ share of total: not verified | C |
| **Side oxidation** | Oxidation of the hot electrode surface over the whole heat; oxygen lancing increases it. | ✅ Oxidation alone ~0.99 kg/t without vs ~1.18 kg/t with an oxygen lance, at one 90 t stainless EAF in Korea; **this is oxidation only, not total** (vendor article, LMM 2021). ⚠ The 30–70% tip/side split is not in the sources read. | C |
| **Total** | | ⚠ The 1985 → 2018 trend (5–6 → 1–2.5 kg/t) is not in the sources read. ✅ LBNL quotes **1–2 kg/tonne** for some modern furnace designs and up to 30% less with DC/shaft designs. ✅ Optimised electrode spray cooling cuts consumption 10–15% (TERI 2017). | C |
| **CO₂** | Graphite is ~99% carbon. | ~**3.6 kg CO₂ per kg electrode** (from 44/12) | A |

**App use:** electrode kg/t per heat if logged, otherwise monthly purchases ÷ tonnes. Shown as RM per tonne and as Scope 1 process CO₂. Trends against power-on time and O₂ show whether tip or side loss dominates.

---

## 5. Temperatures and heel (HMI: Temp °C, liquid heel, hot furnace)

| Factor | How it works | Numbers | Conf. |
|---|---|---|---|
| **Tap temperature (superheat)** | Every extra degree costs energy, and arcing at the end of a heat is inefficient. | Heat stored in steel + slag: **~2.6 kWh/t per 10 °C** (thermodynamics, see §11). Practical cost **~9–13 kWh/t per 10 °C** (from 50–75 kWh/t per 100 °F), because the extra arcing time also loses heat to walls, roof and off-gas. *Corrected: an earlier draft called 4.7 kWh/t per 10 °C "theoretical"; the source's 26 kWh/t per 100 °F is about twice what thermodynamics gives, so it must include losses.* | A (heat) / C (practical) |
| **Liquid (hot) heel** | Speeds melting, but once the heel's own heat is counted, net energy is not clearly lower (one study). | No clean coefficient | P |
| **Cooling-water losses** | Heat lost through water-cooled panels and roof. A good slag coating reduces it. | ~80–145 kWh/t typical; below 70 kWh/t possible with a stable slag layer | B |

**App use:** tap temperature against target, priced at the plant's learned kWh/t per °C (starting from 9–13 kWh/t per 10 °C). If cooling-water flow and ΔT are logged (as on the HMI's cooling panels), heat lost = flow × 4.18 kJ/kg·K × ΔT (exact).

---

## 6. Material and yield (HMI: total scrap, liquid heel, additions, scheduled to tap, tapped steel)

| Factor | How it works | Numbers | Conf. |
|---|---|---|---|
| **Metallic yield** = tapped steel ÷ metallic charge | Lost iron mostly goes to the slag as FeO, plus dust. That iron has to be bought again **and** re-melted. | FeO loss to slag ~5–10% of yield; one plant cut slag FeO from 36–40% to 23–25% | B |
| **Energy of the loss** | Reducing FeO back to Fe takes ~800 kWh per tonne FeO; melting slag ~530 kWh per tonne slag. | ~**10 kWh/t per 1 percentage point of yield** lost to FeO (our estimate from 800 kWh/t FeO), plus the cost of the scrap | C |
| **Money of the loss** | 1% yield on 1 t of steel ≈ 10 kg more scrap. | RM = 10 kg × scrap price (plant input) + energy above | A (given prices) |

**App use:** yield per heat, scrap grade mix vs yield and kWh/t, and "each 1% of yield lost costs RM X/month and Y t CO₂" from the plant's tonnage and scrap price.

---

## 7. Off-gas and heat recovery (HMI: Consteel conveyor, scrap flow, fume system)

| Factor | How it works | Numbers | Conf. |
|---|---|---|---|
| **Off-gas energy** | Hot gas plus unburnt CO/H₂ leaving the furnace. | ~225–250 kWh/t; example composition 25% CO, 25% CO₂, 50% N₂ | B |
| **Post-combustion** | Burns CO to CO₂ inside or above the furnace and recovers the heat. | ✅ 3–5 kWh per Nm³ O₂ (Linde); ✅ preheats scrap to 300–800 °C (EPA); ✅ airtight furnace + post-combustion + fume control **~100 kWh/ton** vs a 450 kWh/ton baseline, ~80% from lower losses, **from pilot trials on a 6-tonne furnace** (Arcelor Research, cited by EPA and LBNL) | B (verified; pilot scale) |
| **Scrap preheating (shaft / Consteel)** | Uses off-gas heat to warm the scrap before it melts. | ✅ **4–50 kWh/short ton** (EPA 2012); ✅ single shaft up to 70, finger shaft up to 100 kWh/ton (~25% of electricity) (EPA); ✅ Consteel: ~400 → 335–355 kWh/ton (LBNL); ✅ Ivaco, Ontario: baseline 343 kWh/t, projected −38 kWh/t (~10%), literature 45–65 kWh/t (ACEEE 2013); ✅ bucket preheating −41 kWh/t with off-gas at 800 °C (TERI 2017). *Corrected: an earlier draft's "model 20–60 kWh/t" is not in the ACEEE paper.* | B (verified) |
| **Other recovery** | Steam or power from off-gas heat. | Theoretical ~75–95 kWh/t per route (one study); real systems recover far less | C |

**App use:** without off-gas analysis, potential is shown as a range from the energy balance. With CO/CO₂/flow data, chemical energy in the off-gas = CO flow × 12.6 MJ/Nm³ (heating value of CO, exact), and the recoverable share uses the ranges above. Options feed the Site 3D planner as design estimates.

---

## 8. Direct CO₂ (Scope 1) for the EAF: carbon mass balance

CBAM requires **direct** emissions for iron and steel, counting fuels, reducing agents, carbon-bearing materials **and electrodes**. The mass-balance method:

```text
Process CO₂ = 44/12 × ( Σ carbon in: electrodes, charge carbon, injected carbon, scrap/DRI/pig iron C, additions
                      − Σ carbon out: steel C, slag C, dust C )
Fuel CO₂     = natural gas (and other fuels) × emission factor
```

**App use:** replaces today's single "process_t" number with this balance per heat (or per month). It's the same figure the CBAM report needs. Official text: **CBAM Implementing Regulation (EU) 2023/1773** (transitional-period reporting): Annex II §3.15.2.2 lists EAF direct emissions including electrode consumption; Annex III B.2.1 states the calculation-based method "may be implemented according to the standard method or the mass balance method". *Corrected: an earlier draft named 2023/1570, which is wrong.* The transitional period ran from 1 Oct 2023 to 31 Dec 2025; check the definitive-period (2026+) acts before relying on details. The app must cite these, not secondary guides.

---

## 9. The per-heat data the Optimise section expects

Minimum (most level-2 systems log these): heat no., date/time, tap-to-tap min, power-on min, active kWh, tapped t, scrap charged t (by grade if possible), liquid heel t, O₂ Nm³, natural gas Nm³, charge carbon kg, injected carbon kg, tap temperature °C.

Better: electrode kg, lime/dolomite kg, slag t and FeO %, cooling-water flow and ΔT, off-gas CO/CO₂ and flow, transformer and reactor tap use.

## 10. Known gaps (do not invent)
- No general coefficient for **power-off delay** energy, **cos φ / reactor tap** optimum, or **hot heel**: learn from plant data.
- **Carbon injection** benefit and **natural gas** benefit vary widely: learn from plant data.
- **Theoretical minimum melting energy** to ~1,600 °C was not confirmed by a primary source in this research. The balance tables put liquid-steel heat at ~390–400 kWh/t; treat as indicative.

---

## 11. First-principles checks (how much to trust the published numbers)

Each published figure was checked against standard thermochemistry (molar volume 22.414 L/mol; enthalpies of reaction at 25 °C). A published practical value must sit **below** its theoretical maximum. If it doesn't, the source includes something else or is wrong.

| Check | Theory | Published | Verdict |
|---|---|---|---|
| O₂ lancing, C → CO (−110.5 kJ/mol CO) | max **2.74 kWh/Nm³ O₂** | ~2 kWh/Nm³ | ✓ consistent (~70% transfer) |
| O₂ post-combustion, CO → CO₂ (−283 kJ/mol CO) | max **7.0 kWh/Nm³ O₂** | 3–5 kWh/Nm³ | ✓ consistent (45–70% transfer) |
| O₂ burning iron, Fe → FeO (≈ −272 kJ/mol) | **6.7 kWh/Nm³ O₂**, but it loses yield | (part of the 2.5–4.4 band) | ✓ explains why high O₂ "savings" can hide yield loss |
| Overall O₂ band | mix of the above | 2.5–4.4 kWh/Nm³ | ✓ plausible |
| Liquid steel heat to 1,600 °C (≈1.36 GJ/t) | **~378 kWh/t** | 390–400 kWh/t in balances | ✓ consistent |
| +10 °C tap temperature (cp steel ≈0.82, slag ≈1.2 kJ/kg·K, 100 kg slag/t) | **~2.6 kWh/t** | "theoretical 26 kWh/t per 100 °F" = 4.7 per 10 °C | ✗ source's "theoretical" is ~2× too high: corrected in §5 |
| CO heating value | **12.6 MJ/Nm³** | — | ✓ used in §7 |
| Electrode CO₂ (99% C × 44/12) | **3.63 kg CO₂/kg** | ~3.6 | ✓ |

**What this does and doesn't prove:** it shows the published values are physically possible and catches mistakes like the tap-temperature one. It cannot prove a plant achieves them; only the plant's own heats can.

## 12. How confidence in this document can be raised further
1. **Read the primary sources in full.** This draft was built from search summaries. Next step: open each paper and record the exact value, furnace size, scrap type and year, plus the page.
2. **Triangulate:** at least three independent sources per coefficient, preferring peer-reviewed papers, government reports (US EPA, LBNL, DOE) and steel handbooks (e.g. the AIST/AISE *Making, Shaping and Treating of Steel*, electric furnace volume) over vendor pages.
3. **Thermodynamic checks** like §11 for every coefficient that has a physical limit.
4. **Plant data:** fit the coefficients on a pilot mill's heat logs; that turns ranges into the plant's own values.
5. **Expert review:** a metallurgist or EAF process engineer signs off the coefficient table, with name and date recorded in the app.

---

## 13. Verification log (18 Nov 2026)

Each figure was checked against the full text of its source where the source could be opened. ✅ = found in the source as stated (or corrected to what the source says); ⚠ = could not be checked (site blocked or figure not in the source).

| Figure | Result | Source read |
|---|---|---|
| O₂ ~3.5 kWh/Nm³ average; ~5 up to 20–25 Nm³/t; lancing ≤ ~2; post-combustion 3–5 | ✅ verified | Linde/InTech chapter |
| O₂ 2.5–4.4 kWh/Nm³ range | ⚠ not traced | UNDP compendium unreachable (certificate error) |
| Oxygen production ~0.5 kWh/Nm³ | ✅ verified | LBNL |
| Lance-burners 10–20 kWh/short ton | ✅ verified (context added) | LBNL |
| Foamy slag | ✅ **5–7 kWh/short ton net**; larger claims ⚠ | LBNL |
| Post-combustion + airtight + fume control ~100 kWh/ton | ✅ verified, pilot scale | EPA, LBNL |
| Scrap preheating 4–50; shaft 70–100 kWh/ton | ✅ verified | EPA |
| Consteel −38 kWh/t at Ivaco (~10%); literature 45–65 | ✅ verified; "20–60 model" ✗ removed | ACEEE |
| Bucket preheating −41 kWh/t | ✅ new | TERI/UNDP 2017 |
| Electrode oxidation 0.99 vs 1.18 kg/t | ✅ but **oxidation only, one furnace** | LMM (vendor) |
| Electrode trend 1985→2018, tip/side 30–70% | ⚠ not in sources read | — |
| Transformer losses up to 7% of electrical input | ✅ new | LBNL (citing 1992 data) |
| Energy balance shares, cooling 83–143 kWh/t, FeO 800 kWh/t | ⚠ not verified (ispatguru unreachable) | — |
| Tap temperature 26 / 50–75 kWh/t per 100 °F | ⚠ not verified (site blocked); thermodynamics gives ~2.6 kWh/t per 10 °C (§11) | — |
| CBAM: electrodes count; mass balance allowed | ✅ verified; regulation number corrected to **2023/1773** | EUR-Lex |

**Still to do for full confidence:** obtain the blocked sources manually (ispatguru, Kipepe & Pan, MDPI Processes 2020, Missouri S&T, the UNDP compendium), or replace them with a steel handbook; read CBAM definitive-period rules and Annex III Sections B.9 and D.

---

## Sources
- Energy balance shares and ranges: [ispatguru — EAF cooling system](https://www.ispatguru.com/electric-arc-furnace-cooling-system/), [Kirschen et al., novel estimation of electrical and cooling losses](https://www.sciencedirect.com/science/article/abs/pii/S0360544212002150), [Thermodynamic analysis of EAF electrical energy demand](https://www.researchgate.net/publication/266466258_Thermodynamic_analysis_of_EAF_electrical_energy_demand), [Analysis of EAF energy efficiency from industrial data (MDPI Metals)](https://www.mdpi.com/2075-4701/16/6/594), [EAF off-gas heat recovery testing plant](https://www.researchgate.net/publication/261376228_Electric_Arc_Furnace_Off-Gas_Heat_Recovery_and_Experience_with_a_Testing_Plant), [UNDP EAF compendium](https://www.sameeeksha.org/books/Electric-Arc-Furnace-Compendium.pdf)
- Oxygen, burners, carbon: [InTech — oxyfuel combustion in the steel industry](https://cdn.intechopen.com/pdfs/11465/InTech-Oxyfuel_combustion_in_the_steel_industry_energy_efficiency_and_decrease_of_co2_emissions.pdf), [MDPI Processes — side-wall injector retrofit](https://doi.org/10.3390/pr8101202), [LBNL steel energy efficiency report](https://www.osti.gov/servlets/purl/1026806), [electricity vs oxygen across melt shops](https://www.researchgate.net/figure/Relation-between-electricity-consumption-and-oxygen-use-for-various-EAF-melt-shops-PC_fig3_267193739)
- Electrodes: [Modifying the EAF voltage tap profile for lower tip consumption](https://www.researchgate.net/publication/335796112_Modifying_the_EAF_voltage_tap_profile_for_lower_electrode_tip_consumption_and_increased_energy_efficiency), [Electrode consumption calculation formula](https://www.researchgate.net/publication/394811079_ELECTRODE_CONSUMPTION_IN_ELECTRIC_ARC_STEEL_FURNACES_-_CALCULATION_FORMULA), [USPTO — electrode consumption model](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11678412), [Luxmet — reducing electrode wear](https://www.luxmet.fi/2022/01/19/reducing-electrode-wear-in-eaf-steelmaking/)
- Arc, foamy slag: [Effect of arc length on heat exchange and power consumption](https://www.researchgate.net/publication/351176611_The_Effect_of_Arc_Length_on_Heat_Exchange_and_Electric_Power_Consumption_in_Electric_Arc_Steel-Making_Furnaces_Eaf), [Kipepe & Pan — foaming slag and energy efficiency](https://core.ac.uk/download/pdf/43603419.pdf), [Slag foaming practice and shop productivity](https://www.researchgate.net/publication/240796102_The_Slag_Foaming_Practice_in_EAF_and_Its_Influence_on_the_Steelmaking_Shop_Productivity), [Alternative carbon sources as foaming agents (review)](https://doi.org/10.3390/min16020152)
- Tap temperature, heel: [Reducing tap temperatures to minimise energy use](https://www.researchgate.net/publication/296696667_Reducing_Tap_Temperatures_to_Minimize_Energy_Use_in_Melting), [Thermal efficiency of steel melting (Missouri S&T)](https://scholarsmine.mst.edu/cgi/viewcontent.cgi?params=%2Fcontext%2Fmatsci_eng_facwork%2Farticle%2F2423%2F&path_info=Thermal_Efficiency_of_Steel_Melting.pdf), [Models for EAF electrical energy consumption](https://www.researchgate.net/publication/239615624_APPLICATION_OF_MODELS_FOR_ELECTRICAL_ENERGY_CONSUMPTION_TO_IMPROVE_EAF_OPERATION_AND_DYNAMIC_CONTROL)
- Yield, FeO: [ispatguru — DRI in the EAF](https://www.ispatguru.com/use-of-direct-reduced-iron-in-electric-arc-furnace/), [Influence of DRI on the EAF energy balance](https://www.researchgate.net/publication/238001283_Influence_of_direct_reduced_iron_on_the_energy_balance_of_the_electric_arc_furnace_in_steel_industry), [Theoretical minimum energies to produce steel](https://www.researchgate.net/publication/236442158_Theoretical_Minimum_Energies_to_Produce_Steel_for_Selected_Conditions)
- Off-gas, preheating: [US EPA — available and emerging technologies for iron and steel](https://www.epa.gov/sites/default/files/2015-12/documents/ironsteel.pdf), [ACEEE — scrap preheating case](https://www.aceee.org/files/proceedings/2013/data/papers/1_175.pdf), [EAF gas waste heat utilisation](https://www.degruyterbrill.com/document/doi/10.1515/htmp-2014-0183/html?lang=en), [Off-gas measurements for stainless EAF balances](https://www.researchgate.net/publication/276409331_Off-gas_measurements_for_mass_and_energy_balances_of_stainless_steel_EAF)
- CBAM carbon balance: [Implementing Regulation (EU) 2023/1773 on EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1773) (primary), [CBAM step guidance (WB6 CIF)](https://www.wb6cif.eu/wp-content/uploads/2024/10/CBAM.pdf), [marketSTEEL — Commission iron and steel guidance](https://www.marketsteel.com/news-details/eu-commission-issues-new-cbam-guidance-for-iron-and-steel.html).
- Read in full for verification: [Linde/InTech — oxyfuel in steel](https://cdn.intechopen.com/pdfs/11465/InTech-Oxyfuel_combustion_in_the_steel_industry_energy_efficiency_and_decrease_of_co2_emissions.pdf), [LBNL/ENERGY STAR guide for US iron and steel (Worrell et al.)](https://www.osti.gov/servlets/purl/1026806), [US EPA, Sept 2012](https://www.epa.gov/sites/default/files/2015-12/documents/ironsteel.pdf), [ACEEE 2013 — Consteel at Ivaco](https://www.aceee.org/files/proceedings/2013/data/papers/1_175.pdf), [TERI/UNDP 2017 Ready Reckoner for EAF](https://sameeeksha.org/books/Electric-Arc-Furnace.pdf), [LMM 2021 — electrode consumption](https://www.lmmgroupcn.com/optimization-ofelectrode-consumption-in-eaf-for-different-operating-conditions/), [Luxmet 2022 — electrode wear](https://www.luxmet.fi/2022/01/19/reducing-electrode-wear-in-eaf-steelmaking/)

*Researched 18 Nov 2026 from published sources. Several are older studies or vendor material; coefficients rated C or P must be calibrated to plant data before use in a business case.*
