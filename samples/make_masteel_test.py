"""
Builds samples/masteel-monthly-test.csv: 36 ILLUSTRATIVE months for testing the Monthly data upload.

Scaled to Masteel's published yearly figures (not its real monthly bills, which are not public):
- FY2023 sustainability report: total GHG 336,081 tCO2e, Scope 1 6,633 t, Scope 3 4,391 t
  -> Scope 2 about 325,000 t -> about 420,000 MWh a year at the 0.774 Peninsular grid factor.
- FY2025 intensity (Scope 1+2): steelmaking 0.456 tCO2e/t, rolling mill 0.085 tCO2e/t
  -> about 650,000 t of billets a year.
- Scope 1 sources named by Masteel: natural gas and diesel. Induction furnaces, so no EAF process CO2.

Run: python samples/make_masteel_test.py
"""
import csv
import random
from pathlib import Path

random.seed(2026)

MONTHS = [(y, m) for y in (2023, 2024, 2025, 2026) for m in range(1, 13)]
MONTHS = [ym for ym in MONTHS if (2023, 11) <= ym <= (2026, 10)]

# Hari Raya Aidilfitri dips (Apr 2024, Mar/Apr 2025, Mar 2026) and the year-end slowdown.
SEASON = {1: 0.97, 2: 0.93, 3: 1.0, 4: 1.0, 5: 1.03, 6: 1.01, 7: 1.03, 8: 1.04, 9: 1.03, 10: 1.05, 11: 1.0, 12: 0.88}
RAYA = {(2024, 4): 0.86, (2025, 3): 0.92, (2025, 4): 0.93, (2026, 3): 0.87}

BILLETS_PER_MONTH = 650_000 / 12
KWH_PER_T = 646            # about 420 GWh / 650 kt
BASE_KWH_SHARE = 0.18      # drawn whatever the output (auxiliaries, lighting, compressors)
GAS_GJ_PER_MONTH = 107_000 / 12      # about 6,000 tCO2 a year at 56.1 kg/GJ
DIESEL_L_PER_MONTH = 210_000 / 12    # about 600 tCO2 a year

rows = []
for k, (y, m) in enumerate(MONTHS):
    output = SEASON[m] * RAYA.get((y, m), 1.0) * (0.97 + 0.03 * k / 35) * random.uniform(0.97, 1.03)
    production = BILLETS_PER_MONTH * output
    # ISO 50001 programme: energy per tonne falls about 2% a year.
    efficiency = 1 - 0.02 * k / 12
    kwh = KWH_PER_T * BILLETS_PER_MONTH * (BASE_KWH_SHARE + (1 - BASE_KWH_SHARE) * output) * efficiency * random.uniform(0.98, 1.02)
    if (y, m) == (2025, 8):
        kwh *= 1.17        # deliberate fault month (to test the unusual-month flag)
    gas = GAS_GJ_PER_MONTH * (0.3 + 0.7 * output) * efficiency * random.uniform(0.96, 1.04)
    diesel = DIESEL_L_PER_MONTH * random.uniform(0.85, 1.15)
    rows.append({
        'month': f'{y}-{m:02d}',
        'electricity_kwh': int(round(kwh, -3)),
        'green_kwh': 0,
        'natural_gas_gj': round(gas),
        'diesel_litres': int(round(diesel, -2)),
        'fuel_oil_gj': 0,
        'coal_gj': 0,
        'biomass_gj': 0,
        'process_t': 0,
        'production_t': round(production),
    })

out = Path(__file__).with_name('masteel-monthly-test.csv')
with out.open('w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)

year = [r for r in rows if r['month'].startswith('2025')]
mwh = sum(r['electricity_kwh'] for r in year) / 1000
s2 = mwh * 0.774
s1 = sum(r['natural_gas_gj'] for r in year) * 56.1 / 1000 + sum(r['diesel_litres'] for r in year) * 0.0386 * 74.1 / 1000
t = sum(r['production_t'] for r in year)
print(f'{out.name}: {len(rows)} months. 2025: {mwh:,.0f} MWh, Scope 1 {s1:,.0f} t, Scope 2 {s2:,.0f} t, {t:,.0f} t billets, {(s1 + s2) / t:.3f} tCO2e/t')
