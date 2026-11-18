"""
Builds samples/masteel-monthly-test.csv: 36 ILLUSTRATIVE months for testing the Monthly data upload.

Scaled to Masteel's published yearly figures (not its real monthly bills, which are not public):
- FY2023 sustainability report: total GHG 336,081 tCO2e, Scope 1 6,633 t, Scope 3 4,391 t
  -> Scope 2 about 325,000 t -> about 420,000 MWh a year at the 0.774 Peninsular grid factor.
- FY2025 intensity (Scope 1+2): steelmaking 0.456 tCO2e/t, rolling mill 0.085 tCO2e/t
  -> about 650,000 t of billets a year.
- Scope 1 sources named by Masteel: natural gas and diesel. Induction furnaces, so no EAF process CO2.

Month-to-month swings are made to look like a real induction mini-mill, not a smooth line. Each is an
illustrative event, not something Masteel reported:
- steel demand: a construction slowdown through late 2024, recovering through 2025
- Hari Raya dips (Apr 2024, Mar/Apr 2025, Mar 2026) and the December slowdown
- planned furnace relining: Jul 2024 and Jun 2026 (one furnace down for about 10 days)
- unplanned outage: Jan 2026, main transformer trip, about a week lost
- gas curtailment: Nov 2024, the reheating furnace runs partly on diesel
- energy per tonne falls about 2% a year (ISO 50001 programme), plus scrap-quality noise
- Aug 2025: electricity 17% too high on purpose (to test the unusual-month flag)

Run: python samples/make_masteel_test.py
"""
import csv
import math
import random
from pathlib import Path

random.seed(2026)

MONTHS = [(y, m) for y in (2023, 2024, 2025, 2026) for m in range(1, 13)]
MONTHS = [ym for ym in MONTHS if (2023, 11) <= ym <= (2026, 10)]

SEASON = {1: 0.97, 2: 0.93, 3: 1.0, 4: 1.0, 5: 1.03, 6: 1.01, 7: 1.03, 8: 1.04, 9: 1.03, 10: 1.05, 11: 1.0, 12: 0.88}
RAYA = {(2024, 4): 0.86, (2025, 3): 0.92, (2025, 4): 0.93, (2026, 3): 0.87}
RELINING = {(2024, 7): 0.82, (2026, 6): 0.85}           # one of four furnaces down about 10 days
OUTAGE = {(2026, 1): 0.78}                               # transformer trip, about a week lost
GAS_CURTAILED = {(2024, 11): 0.45}                       # share of normal gas; diesel covers the rest

BILLETS_PER_MONTH = 650_000 / 12
KWH_PER_T = 646            # about 420 GWh / 650 kt
BASE_KWH_SHARE = 0.18      # drawn whatever the output (auxiliaries, lighting, compressors)
GAS_GJ_PER_MONTH = 107_000 / 12      # about 6,000 tCO2 a year at 56.1 kg/GJ
DIESEL_L_PER_MONTH = 210_000 / 12    # about 600 tCO2 a year
DIESEL_GJ_PER_L = 0.0386


def demand(k: int) -> float:
    """Steel demand: dips about 7% around Oct 2024 (month 11), back by mid 2025, a smaller wobble in 2026."""
    return 1 - 0.07 * math.exp(-((k - 11) / 4.5) ** 2) + 0.025 * math.sin(k / 3.2)


rows = []
for k, (y, m) in enumerate(MONTHS):
    output = (SEASON[m] * RAYA.get((y, m), 1.0) * RELINING.get((y, m), 1.0) * OUTAGE.get((y, m), 1.0)
              * demand(k) * (0.98 + 0.04 * k / 35) * random.uniform(0.95, 1.05))
    production = BILLETS_PER_MONTH * output
    efficiency = 1 - 0.02 * k / 12
    scrap = random.uniform(0.975, 1.025)            # scrap density and rust change kWh per tonne
    kwh = KWH_PER_T * BILLETS_PER_MONTH * (BASE_KWH_SHARE + (1 - BASE_KWH_SHARE) * output) * efficiency * scrap
    if (y, m) in RELINING:
        kwh *= 1.03        # first heats on a new lining run cold
    if (y, m) == (2025, 8):
        kwh *= 1.17        # deliberate fault month (to test the unusual-month flag)
    gas_full = GAS_GJ_PER_MONTH * (0.3 + 0.7 * output) * efficiency * random.uniform(0.92, 1.08)
    gas_share = GAS_CURTAILED.get((y, m), 1.0)
    gas = gas_full * gas_share
    # Diesel: forklifts and loaders, plus backup burners for any gas that didn't arrive.
    diesel = DIESEL_L_PER_MONTH * (0.6 + 0.4 * output) * random.uniform(0.8, 1.2) + gas_full * (1 - gas_share) / DIESEL_GJ_PER_L
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


def year_summary(year: str) -> str:
    rs = [r for r in rows if r['month'].startswith(year)]
    mwh = sum(r['electricity_kwh'] for r in rs) / 1000
    s2 = mwh * 0.774
    s1 = sum(r['natural_gas_gj'] for r in rs) * 56.1 / 1000 + sum(r['diesel_litres'] for r in rs) * DIESEL_GJ_PER_L * 74.1 / 1000
    t = sum(r['production_t'] for r in rs)
    return f'{year} ({len(rs)} mo): {mwh:,.0f} MWh, Scope 1 {s1:,.0f} t, Scope 2 {s2:,.0f} t, {t:,.0f} t billets, {(s1 + s2) / t:.3f} tCO2e/t'


print(f'{out.name}: {len(rows)} months')
for yr in ('2024', '2025'):
    print(' ', year_summary(yr))
co2 = [r['electricity_kwh'] * 0.774 / 1e6 for r in rows]
print(f'  monthly Scope 2 range {min(co2):.1f}-{max(co2):.1f} kt (old file: about 23-31 kt)')
