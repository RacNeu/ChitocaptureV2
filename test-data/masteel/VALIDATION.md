# ChitoCapture calculation check against Masteel's published figures

**Source (real data):** Malaysia Steel Works (KL) Bhd, *Sustainability Report FY2024*:
- energy table on p.50
- electricity in kWh on p.51
- GHG table and methodology notes on p.152

https://www.masteel.com.my/wp-content/uploads/2025/05/optimized_full_masteel_sustainability_report_fy2024_complete.pdf

Method: Masteel's published activity data (electricity, natural gas and diesel) are run through ChitoCapture's own calculation (`scopesFor`, the same code the dashboard and reports use). The results are compared with the emissions Masteel reported. The automated test is `src/model/validation.test.ts`; run it with `npm test`.

## Scope 2 (purchased electricity): exact match

| Year | Electricity (published) | Grid factor Masteel used | ChitoCapture | Masteel reported | Difference |
|---|---|---|---|---|---|
| FY2022 | 1,374,433.97 GJ = 381,787 MWh | 0.585 (2017 CDM baseline) | 223,345.52 t | 223,345.52 t | 0.00% |
| FY2023 | 428,835,395 kWh | 0.758 (EC GEF 2021) | 325,057.23 t | 325,057.23 t | 0.00% |
| FY2024 | 398,450,750 kWh | 0.774 (EC GEF 2022) | 308,400.88 t | 308,400.88 t | 0.00% |

Scope 2 is about 98% of Masteel's Scope 1 + 2. The published GJ and kWh figures also agree with each other (kWh × 0.0036 = GJ).

## Scope 1 (fuel burnt on site): close, with explained differences

| Item | Year | ChitoCapture | Masteel reported | Difference | Why |
|---|---|---|---|---|---|
| Diesel, 21,616.15 GJ | FY2024 | 1,601.76 t | 1,622.61 t | −1.3% | We use the IPCC 2006 CO₂-only factor (74.1 kg/GJ). Masteel uses US EPA 2023 factors, which add CH₄ and N₂O. |
| Diesel, 21,955.60 GJ | FY2023 | 1,626.91 t | 1,505.08 t | +8.1% | Masteel's FY2023 factor isn't stated in enough detail to explain this. Ours is the conservative (higher) figure. |
| Natural gas, 42,327 GJ | FY2024 | 2,374.54 t | (in "process" 3,228.77 t) | — | Masteel's "process" line (ISO 14404) also includes carbon inputs such as electrodes and additives, about 854 t. In ChitoCapture these go in `process_t`. |
| Natural gas, 71,054 GJ | FY2023 | 3,986.13 t | (in "process" 4,943.03 t) | — | Carbon inputs about 957 t. |

## What this shows, and its limits

- **Scope 2 reproduces Masteel's disclosure exactly** for three years, once the same grid factor is used. Grid factors are editable in Settings, and the factor is saved when a year is signed off.
- **Scope 1 combustion is within 1.3% for FY2024.** The remaining gap is a documented choice of factor, not a calculation error.
- **Not covered yet:**
  - fugitive refrigerant emissions (Masteel reports about 350–490 t a year)
  - CH₄ and N₂O from combustion
- **No production tonnage is published**, so intensity per tonne can't be checked independently.
- **Masteel publishes annual totals only.** No real monthly bill data is public, so the monthly test file (`masteel-monthly-test.csv`) is illustrative.
