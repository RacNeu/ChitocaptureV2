MASTEEL TEST DATA FOR CHITOCAPTURE
==================================

Files
-----
REAL DATA (published by Masteel):
masteel-published-fy2022-2024.csv  Real annual electricity, gas, diesel and reported Scope 1/2,
                                   from Masteel's Sustainability Report FY2024 (pages listed in the file)
VALIDATION.md                      ChitoCapture's calculation vs Masteel's reported figures
                                   (Scope 2 matches exactly for FY2022-FY2024)

ILLUSTRATIVE DATA (NOT Masteel's real bills - monthly bills are not public):
masteel-monthly-test.csv   36 months (Nov 2023 - Oct 2026) for testing the Monthly data upload
masteel-monthly-test.xlsx  The same data as an Excel sheet
masteel-halfhourly-test.csv  Half-hourly demand in kW, 1 Aug - 31 Oct 2026, for the Load profile page.
                             Averages 45.5 MW = Masteel's real FY2024 electricity (398,450,750 kWh/yr).
                             Expect: monthly peaks on 11 Aug 14:00, 8 Sep 14:30, 13 Oct 14:00
                             (about 65 MW), Sunday daytime stops, and a warning for 6 missing
                             readings on 17 Sep (deliberate meter gap).
Do not use the illustrative files in any report or present them as Masteel's figures.

How it was scaled (Masteel's published yearly figures)
-------------------------------------------------------
- Scope 1: about 6,600 tCO2e a year (FY2023 report), from natural gas and diesel
- Scope 2: about 325,000 tCO2e a year -> about 400-420 GWh at 0.774 kg CO2/kWh
- About 630,000-650,000 t of billets a year (FY2025 intensity 0.456 t/t steelmaking)
- Induction furnaces, so process_t is 0

Built-in test cases
-------------------
- Hari Raya dips (Apr 2024, Mar-Apr 2025, Mar 2026) and a December slowdown
- Energy per tonne improves about 2% a year
- Aug 2025 electricity is 17% too high on purpose -> should be flagged as an unusual month
- green_kwh is 0: type a number in recent months to test market-based Scope 2

How to test
-----------
1. Sign in, open Monthly data, choose masteel-monthly-test.csv (or the .xlsx).
2. Dashboard: Scope 1 about 6,300 t, Scope 2 about 313,000 t per year.
3. Check Aug 2025 appears as an unusual month.
4. As Sustainability, sign off 2024, then upload again: 2024 should stay unchanged.

Regenerate: python samples/make_masteel_test.py
