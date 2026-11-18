MASTEEL TEST DATA FOR CHITOCAPTURE
==================================

Files
-----
REAL DATA (published by Masteel):
masteel-published-fy2022-2024.csv  Real annual electricity, gas, diesel and reported Scope 1/2,
                                   from Masteel's Sustainability Report FY2024 (pages listed in the file)
VALIDATION.md                      CarbonPath's calculation vs Masteel's reported figures
                                   (Scope 2 matches exactly for FY2022-FY2024)

ILLUSTRATIVE DATA (NOT Masteel's real bills - monthly bills and meter data are not public):
masteel-monthly-test.csv     36 months (Nov 2023 - Oct 2026) for testing the Monthly data upload
masteel-monthly-test.xlsx    The same data as an Excel sheet
masteel-halfhourly-test.csv  Half-hourly demand in kW, 1 Aug - 31 Oct 2026, for the Electricity load page.
                             Averages 45.5 MW = Masteel's real FY2024 electricity (398,450,750 kWh/yr).
Do not use the illustrative files in any report or present them as Masteel's figures.

How it was scaled (Masteel's published yearly figures)
-------------------------------------------------------
- Scope 1: about 6,400 tCO2e a year, from natural gas and diesel (FY2023 report: 6,633 t)
- Scope 2: about 306,000-314,000 tCO2e a year -> about 395-406 GWh at 0.774 kg CO2/kWh
- About 610,000-640,000 t of billets a year
- Induction furnaces, so process_t is 0

Built-in events, monthly file (illustrative, not reported by Masteel)
---------------------------------------------------------------------
- Steel demand: construction slowdown through late 2024, recovering in 2025
- Hari Raya dips (Apr 2024, Mar-Apr 2025, Mar 2026) and a December slowdown
- Furnace relining: Jul 2024 and Jun 2026 (output down 15-18%, energy per tonne up)
- Transformer trip: Jan 2026, about a week of output lost
- Gas curtailment: Nov 2024, the reheating furnace runs partly on diesel (Scope 1 mix shifts)
- Energy per tonne improves about 2% a year, with month-to-month scrap-quality noise
- Aug 2025 electricity is 17% too high on purpose -> the only month flagged as unusual
- green_kwh is 0: type a number in recent months to test market-based Scope 2

Built-in events, half-hourly file
---------------------------------
- Four induction furnaces running real heat cycles (charge, melt, tap), 70-95 minutes a heat
- TNB off-peak nights (22:00-08:00): all four furnaces melt; three by day; two 18:00-22:00
- Rolling mill 07:00-23:00 (Saturday until 15:00), shift change at 15:00, roll changes Tue and Fri
- Sunday 08:00-20:00 maintenance stop; public holidays 25 Aug, 31 Aug, 16 Sep (mill off, two furnaces)
- Scrap shortages 4-5 Aug, 7 Oct and 27 Oct (two furnaces all day); IF3 relined 21-23 Sep
- Monthly peaks on 11 Aug, 8 Sep and 13 Oct at 14:30 (about 75 MW)
- 6 missing readings on 17 Sep (deliberate meter gap) -> the page should warn about them

How to test
-----------
1. Sign in, open Energy & carbon -> Upload bills, choose masteel-monthly-test.csv (or the .xlsx).
2. Emissions: Scope 1 about 6,400 t, Scope 2 about 306,000-314,000 t per year.
3. Check Aug 2025 appears as an unusual month.
4. Electricity load: upload masteel-halfhourly-test.csv; check the three peaks and the gap warning.
5. As Sustainability, sign off 2024, then upload the monthly file again: 2024 should stay unchanged.

Regenerate: see samples/build_test_pack.py
