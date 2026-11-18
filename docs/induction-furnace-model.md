# Induction furnace + ladle furnace model: factors, sources and confidence

For the **Melt shop** section (coreless induction furnace → ladle furnace → caster), the route used by
Masteel (60 t induction furnaces since 2021) and many Malaysian long-steel mills.

**Confidence**
- ✅ **Verified**: the figure was found in the source as stated (source read in full or the passage quoted).
- ⚠ **Rough**: a vendor or secondary source, or a figure we could not check. Use as a starting value; the plant's own heats replace it.
- 🧮 **Physics**: worked out from thermodynamics, shown below.

Units: US sources use the *short ton* (907 kg). Multiply kWh/short ton by **1.102** to get kWh/tonne.

---

## 1. How much electricity melting steel needs

| Figure | Value | Confidence | Source |
|---|---|---|---|
| Heat needed to melt scrap and bring it to ~1,649 °C | **350 kWh/short ton ≈ 386 kWh/t** | ✅ | Missouri S&T / US DOE, *Melting Efficiency Improvement*, final report (OSTI 1051407), p.6 and p.10 |
| Liquid steel heat in measured heats | 352–360 kWh/short ton (≈ 390–397 kWh/t) | ✅ | same report, Fig. 4–5 Sankey diagrams |
| Typical steel melting in induction furnaces | **450–800 kWh/short ton** (four foundries) | ✅ | same report, p.10 |
| Typical induction furnace | 530–600 kWh/short ton; arc furnace 450 | ✅ | US DOE, *Theoretical/Best Practice Energy Use in Metalcasting Operations* (Schifo, 2004), p.35 |
| Best-practice batch induction melter | 530 kWh/short ton; overall efficiency ~70% | ✅ | DOE Schifo 2004, p.22 |
| Power supply efficiency (large furnaces) | > 96% | ✅ | DOE Schifo 2004, p.22 |
| Coil efficiency | up to **95%** on solid magnetic scrap, **80%** heating a liquid bath | ✅ | DOE Schifo 2004, p.21 |
| Ferrous melting, good practice | ~500–560 kWh/t; one foundry 640 → 570 kWh/t | ⚠ vendor | Otto Junker / Inductotherm article, *Foundry Management & Technology* |
| Specific energy of coreless furnaces | 500–800 kWh/t by type and grade | ⚠ secondary | JS Autocast operating practices |

**🧮 Check.** Steel enthalpy from 25 °C to liquid at ~1,600 °C is about 1.40 GJ/t = **389 kWh/t**. This agrees with the 386–397 kWh/t above. So a 60 t furnace at 560 kWh/t turns roughly **70%** of its electricity into hot steel, matching DOE's 70% best practice.

## 2. Where the rest goes (measured energy balance)

Missouri S&T measured cooling water, radiation and lining heat in steel heats (OSTI 1051407, Figs. 4–5). All values ✅, in kWh/short ton:

| Heat | Electricity | Liquid steel | Cooling water (coil Joule + conduction) | Lining heat-up | Radiation |
|---|---|---|---|---|---|
| Cold lining, open | 666 | 360 (54%) | 191 (29%) | **95 (14%)** | ~3% |
| Preheated lining | 562 | 352 (63%) | 144 (26%) | 58 (10%) | ~1.5% |
| Hot lining + heel | 500 | 356 (68%) | 152 (29%) | 3 (0.6%) | ~3% |
| Hot lining + heel, covers | 473 | 357 (71%) | 134 (27%) | 4 (0.8%) | ~1% |

**What the model takes from this**
- **Cooling water is the biggest loss** (~26–29%). It is mostly fixed per hour of power-on, so **longer heats cost more**.
- **Cold-lining heats** (first heat after a stop or a reline) cost about **+100 kWh/short ton**. Gas-preheating the lining saved "nearly 100 kWh/ton" ✅.
- The industrial trial (same report, Table 3 ✅) found:
  - Cold lining: **653** kWh/short ton, 207 min melt time.
  - Hot lining + heel: **545**, 120 min.
  - After the practice changes: **517–519**.
  - Practice changes saved **5–10%** on hot-lining heats and **15%** on first heats.

## 3. Operating factors: effect on kWh per tonne

| Factor | Effect | Confidence | Source |
|---|---|---|---|
| **Holding / waiting with liquid steel** | Main gap between theory and practice; heats with no delays were consistently lowest | ✅ (qualitative) | OSTI 1051407 |
| **Thermal loss while holding** | 15 t furnace: ~275 kW with lid closed, **~600 kW** with lid open | ⚠ vendor | Otto Junker article |
| **Lid left open** | 20 min open ≈ **+15 kWh/t** (up to ~2% of consumption) | ⚠ vendor | Otto Junker article |
| **Superheat** | Avoiding a 50 K overshoot saves ~**20 kWh/t** (≈ 0.4 kWh/t per °C) | ⚠ vendor | Otto Junker article |
| Heat to raise liquid steel 1 °C | **0.23 kWh/t per °C** before losses | ✅ / 🧮 | CTC-N Thailand benchmarking study, §4.4.2; matches c_p ≈ 0.82 kJ/kg·K |
| **Low charge density** | 2.0 → 1.3 t/m³: melting ~8% longer, **+25 kWh/t** | ⚠ vendor | Otto Junker article |
| Shredded / vibro-fed charging | saves **15–20 kWh/t** | ⚠ secondary | BEE (India) technology annex |
| **Running below full power** | at 50% power, **+20 kWh/t** | ⚠ vendor | Otto Junker article |
| **Rusty scrap** | **+30 kWh/t** | ⚠ vendor | Otto Junker article |
| **Sand / dirt** | 25 kg/t of sand → **+25 kWh/t**; "one pound of sand charged means two pounds of iron or steel not melted" | ⚠ vendor / ✅ | Otto Junker; DOE Schifo 2004 |
| **Late carbon additions** | +1–2 kWh per kg of carburiser | ⚠ vendor | Otto Junker article |
| **Liquid heel** | Melting into a heel reduces kWh/t (Table 3: 545 → 517 with heel) | ✅ | OSTI 1051407 |
| **Worst-case practice** | can exceed the necessary energy by **> 35%** | ⚠ vendor | Otto Junker article |

**🧮 Superheat cross-check.** 0.23 kWh/t per °C ÷ ~0.6 bath-heating efficiency (the report's 30–50% open-bath heating efficiency was lower) ≈ **0.4 kWh/t per °C**. This agrees with the vendor's 20 kWh/t per 50 K.

## 4. Power supply

| Figure | Value | Confidence | Source |
|---|---|---|---|
| IGBT power factor | ~0.98–1.0; thyristor (SCR) ~0.85 and falling as the charge heats | ⚠ vendor | Otto Junker proceedings 2021; Kintek |
| IGBT vs SCR energy saving | claims range **5–25%**; no independent steel data found | ⚠ vendor, conflicting | UIHM; Kintek |
| IGBT capex | 20–40% above SCR | ⚠ vendor | Kintek |

The simulator therefore shows the IGBT upgrade as a **range** tagged "vendor claim", and asks for a supplier quote.

## 5. Ladle furnace (LF) and ladles

| Figure | Value | Confidence | Source |
|---|---|---|---|
| LF electricity | **33–70 kWh/t**, average **45** | ✅ (text prints "%", the figure axis and the summary table use kWh/t) | CTC-N, *Benchmarking Study for Thailand's Iron & Steel Industries*, §4.4.1 |
| LF heating efficiency | 3–35%, average 17% (Japan 35%) | ✅ | same, §4.4.2 |
| Ladle preheating fuel | **0.19–0.90 GJ/t**, average 0.57; oxy-fuel burners ~0.3 GJ/t | ✅ | same, §4.5.1 |
| LF electrode consumption | no reliable LF-only figure found; EAF 1.1–3.0 kg/t (avg 1.5) | ⚠ | same, §4.3.3 (EAF). **Learn from the plant's own data.** |

## 6. Carbon (Scope 1 and 2)

- **Scope 2:** kWh × Malaysian grid factor (0.774 kg/kWh, Energy Commission 2022) ✅, the same as the rest of the app.
- **Scope 1** for this route:
  - **Electrodes and carbon in the LF**, by carbon mass balance: C × 44/12, CBAM Implementing Regulation (EU) 2023/1773 ✅, see `eaf-optimisation-model.md`.
  - **Carbon in ferroalloys and carburiser** (e.g. high-carbon FeMn ~6–7% C ⚠, from the supplier's certificate).
  - **Ladle-preheating gas** at 56.1 kg CO₂/GJ (IPCC) ✅.
- An induction furnace burns no electrodes. Its Scope 1 is close to zero apart from carbon added to the bath and oxidised.

## 7. Charge chemistry and grade limits

| Rebar grade BS 4449:2005 (basis of MS 146), cast analysis, max % | C 0.22 · S 0.050 · P 0.050 · N 0.012 · Cu 0.80 · CEV 0.50 | ⚠ (unofficial copy; confirm against the purchased standard) |
|---|---|---|

- **Product analysis** limits are slightly higher: C 0.24, S 0.055, P 0.055, N 0.014, Cu 0.85, CEV 0.52.
- C may exceed its limit by 0.03 if CEV is 0.02 lower.
- An induction furnace **does not refine**: there is no oxygen blowing to remove phosphorus, sulphur or copper. So **the scrap mix sets the chemistry**, and copper and tin from mixed scrap are the main risk. The model checks every simulated scrap mix against these limits.

## 7b. Masteel reference (for the demo dataset)

- Masteel replaced its EAF with **60 t induction furnaces in 2021**, after a 4-year revamp; nominal capacity ~800 kt/yr crude steel ✅ (GEM Wiki, Global Energy Monitor).
- It describes itself as using a hybrid induction + ladle refining configuration, fully induction from Phase III (2021) ✅ (masteel.com.my sustainability page).
- **Direct billet charging**: no reheating furnace gas ✅ (same page).
- The number of furnaces and the ladle furnace details are **not published**. The demo uses 4 × 60 t induction furnaces + 1 ladle furnace and is labelled illustrative.

## 8. Electricity price (TNB, July 2025 RP4 structure)

| Item | Value | Confidence | Source |
|---|---|---|---|
| ToU hours, MV/HV | Peak **Mon–Fri 14:00–22:00**; off-peak 22:00–14:00 and all weekend | ✅ | myTNB tariff page |
| Maximum demand during off-peak | **not charged** for MV/HV | ✅ | myTNB tariff page |
| HV General: capacity / network | RM 16.68 / 14.53 per kW·month; retail RM 250 | ✅ (search summary of the myTNB page) | myTNB |
| HV ToU: capacity / network (peak) | RM 21.76 / 23.06 per kW·month | ✅ (same) | myTNB |
| HV energy | General 43.03 sen/kWh; ToU peak 44.52, off-peak 40.43 | ⚠ consultancy guides, not seen on the official page | trexon.my, plusxnergy |
| Fuel adjustment (AFA) | ± up to 3 sen/kWh monthly | ⚠ | consultancy guides |

All tariff values are editable in Settings, and the app tags them as assumptions until the plant enters its own bill.

## 9. Physics checks used by the model

1. **Liquid steel energy** ≈ 389 kWh/t at 1,600 °C (§1). A heat below **~400 kWh/t** is physically doubtful and gets flagged as a meter or weighing error.
2. **Superheat** ≈ 0.23 kWh/t per °C into the steel, ~0.4 kWh/t per °C from the grid (§3).
3. **Radiation from an open bath:** εσT⁴ with ε ≈ 0.4 at 1,873 K ≈ **280 kW/m²**.
   - A ~2 m bath (3.1 m²) loses ~0.9 MW with the lid open. This is the same order as the vendor's 600 kW for a 15 t furnace.
   - So the lid matters, and a lid-open timer is worth logging.
4. **Cooling-water heat** = flow × 4.18 kJ/kg·K × ΔT. With coil water flow and in/out temperatures, the twin computes this loss live and checks it against the ~26–29% share above.

## 10. What is not verified yet (to do)

- LF electrode consumption per tonne (no clean source): learn from plant data.
- IGBT saving: vendor claims only.
- Lining campaign length (heats per lining) and coil-water alarm set points: these vary by refractory and OEM. Use the plant's own supplier data. The app learns the normal band from the plant's readings rather than using fixed limits.
- HV energy rates on the official TNB page.

---

## Sources

- Missouri University of Science & Technology for US DOE, *Melting Efficiency Improvement* final technical report: [OSTI 1051407](https://www.osti.gov/servlets/purl/1051407). Read in full.
- J. F. Schifo / US DOE, *Theoretical/Best Practice Energy Use in Metalcasting Operations* (2004): [energy.gov PDF](https://www.energy.gov/sites/prod/files/2013/11/f4/doebestpractice_052804.pdf). Read in full.
- Otto Junker / INDUTEC, *Techniques for Conserving Induction Melting Energy*, Foundry Management & Technology: [foundrymag.com](https://www.foundrymag.com/melt-pour/media-gallery/55141301/techniques-for-conserving-induction-melting-energy-otto-junker-gmbh-and-init-inuatek-a-s) (vendor).
- CTC-N, *Benchmarking Study for Thailand's Iron & Steel Industries*: [ctc-n.org](https://www.ctc-n.org/file-download/download/private/22099). Read in full.
- BEE India technology annex (shredded/vibro charging); JS Autocast, *Operating practices for induction furnace* (secondary).
- Power supplies: [Otto Junker proceedings 2021](https://otik.uk.zcu.cz/bitstream/11025/45682/1/Proceeding_2021_final-4-5.pdf), [Kintek](https://kintekfurnace.com/faqs/how-does-the-igbt-induction-melting-furnace-maintain-constant-power-output), [UIHM](https://uihm.com/m_en/IGBT-Induction-Heater-Profiles-12-77-265.html) (vendors).
- Masteel: [masteel.com.my sustainability](https://www.masteel.com.my/masteel-sustainability/), [GEM Wiki — Malaysia Steel Works Klang](https://gem.wiki/Malaysia_Steel_Works_Klang).
- TNB tariff: [myTNB tariff page](https://www.mytnb.com.my/tariff/index.html?v=1.1.47), [trexon.my guide](https://trexon.my/guides/tnb-tariff-2026), [plusxnergy guide](https://www.plusxnergy.com/july-2025-tnb-tariff-update-what-malaysian-businesses-need-to-know/).
- BS 4449:2005 chemical limits: unofficial copy on Scribd. Confirm against the purchased standard.
- Lining and coil safety: [Foundry Management & Technology — refractory safety](https://www.foundrymag.com/melt-pour/article/21928460/molten-metal-splash-and-furnace-refractory-safety-part-2).
