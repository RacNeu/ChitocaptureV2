"""
Builds test-data/masteel/masteel-halfhourly-test.csv: ILLUSTRATIVE half-hourly demand (kW) for
1 Aug - 31 Oct 2026, for testing the Load profile upload. Masteel does not publish meter data.

Scaled to Masteel's real published FY2024 electricity: 398,450,750 kWh a year
(Sustainability Report FY2024 p.51) -> about 45.5 MW average demand.

Shape (typical of an induction-furnace meltshop plus rolling mill, not measured):
- base load about 14 MW (auxiliaries, fume extraction, compressors, cooling water), a little higher
  in the afternoon heat (cooling towers and chillers work harder)
- four induction furnaces, each running heat after heat: charge (low power), melt (full power),
  sample and tap (low power), about 70-95 minutes a heat; minute-by-minute power is averaged per half hour
- TNB peak/off-peak tariff: all four furnaces melt at night (22:00-08:00), three by day, two from
  18:00 to 22:00 when the evening lining checks are done
- scrap shortages (4-5 Aug, 7 Oct, 27 Oct): the yard runs short and only two furnaces melt all day
- Sunday 08:00-20:00 maintenance stop: furnaces idle, auxiliaries stay on
- rolling mill runs 07:00-23:00 (Saturday 07:00-15:00) with a 30-minute shift change at 15:00 and a
  roll change on Tuesday and Friday mornings
- about 1 heat in 8 waits 20-90 minutes for a ladle or crane before tapping
- public holidays (Maulidur Rasul 25 Aug, Merdeka 31 Aug, Malaysia Day 16 Sep): mill off, two furnaces
- furnace IF3 relined 21-23 Sep: three furnaces only, day and night
- one coincident peak a month (2nd Tuesday, 14:00-15:00): mill restart while all furnaces melt
- a few missing readings (meter gap on 17 Sep) to test the gap warning

Run: python samples/make_masteel_halfhourly.py
"""
import csv
import random
from datetime import date, datetime, timedelta
from pathlib import Path

random.seed(50001)
TARGET_AVG_KW = 398_450_750 / 8760

start, end = datetime(2026, 8, 1), datetime(2026, 11, 1)
HOLIDAYS = {date(2026, 8, 25), date(2026, 8, 31), date(2026, 9, 16)}
SCRAP_SHORT = {date(2026, 8, 4), date(2026, 8, 5), date(2026, 10, 7), date(2026, 10, 27)}
RELINE = (datetime(2026, 9, 21), datetime(2026, 9, 24))
FURNACE_KW = 9_600          # one furnace at full melting power
MILL_KW = 9_000


def is_peak(t: datetime) -> bool:
    """The monthly coincident peak: 2nd Tuesday, 14:00-15:00."""
    return 8 <= t.day <= 14 and t.isoweekday() == 2 and t.hour == 14


def furnaces_allowed(t: datetime) -> int:
    h = t.hour + t.minute / 60
    if t.isoweekday() == 7 and 8 <= h < 20:
        return 0                                    # Sunday maintenance stop
    n = 4 if (h >= 22 or h < 8) else 2 if h >= 18 else 3   # off-peak nights run every furnace
    if t.date() in HOLIDAYS or t.date() in SCRAP_SHORT:
        n = 2
    if RELINE[0] <= t < RELINE[1]:
        n = min(n, 3)
    return n


# Each furnace runs its own heat cycle, minute by minute: charge, melt, tap.
minutes = int((end - start).total_seconds() // 60)
power = [0.0] * minutes
for f in range(4):
    m = random.randint(0, 80)
    while m < minutes:
        t = start + timedelta(minutes=m)
        if f >= furnaces_allowed(t) and not is_peak(t):
            for k in range(m, min(m + 30, minutes)):
                power[k] += 0.03                    # idle: holding power only
            m += 30
            continue
        charge, melt, tap = random.randint(8, 14), random.randint(45, 62), random.randint(10, 18)
        if random.random() < 0.125:
            tap += random.randint(20, 90)           # a delay: waiting for the ladle or a crane
        for k in range(m, min(m + charge, minutes)):
            power[k] += 0.25
        for k in range(m + charge, min(m + charge + melt, minutes)):
            power[k] += random.uniform(0.9, 1.0)
        for k in range(m + charge + melt, min(m + charge + melt + tap, minutes)):
            power[k] += 0.12
        m += charge + melt + tap

raw = []
t = start
while t < end:
    i = int((t - start).total_seconds() // 60)
    furnace_kw = FURNACE_KW * (4.0 if is_peak(t) else sum(power[i:i + 30]) / 30)
    h = t.hour + t.minute / 60
    dow = t.isoweekday()
    mill_on = 7 <= h < (15 if dow == 6 else 23) and not (dow == 7 and 8 <= h < 20) and t.date() not in HOLIDAYS
    if 15 <= h < 15.5 or (dow in (2, 5) and 9 <= h < 10.5):
        mill_on = False                             # shift change, roll change
    mill = 1.0 if is_peak(t) else (random.uniform(0.75, 1.0) if mill_on else 0.12)
    base = 14_000 + 1_500 * max(0.0, 1 - abs(h - 15) / 6)  # cooling works harder in the afternoon
    kw = base + furnace_kw + MILL_KW * mill + random.gauss(0, 500)
    gap = t.month == 9 and t.day == 17 and 10 <= h < 13
    raw.append((t, None if gap else kw))
    t += timedelta(minutes=30)

values = [v for _, v in raw if v is not None]
scale = TARGET_AVG_KW / (sum(values) / len(values))

out = Path(__file__).resolve().parent.parent / 'test-data' / 'masteel' / 'masteel-halfhourly-test.csv'
out.parent.mkdir(parents=True, exist_ok=True)
with out.open('w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['timestamp', 'kW'])
    for when, v in raw:
        if v is not None:
            w.writerow([when.strftime('%Y-%m-%d %H:%M'), round(v * scale)])

kept = [v * scale for v in values]
print(f'{out.name}: {len(kept)} readings, {len(raw) - len(kept)} missing, avg {sum(kept) / len(kept) / 1000:.1f} MW, '
      f'min {min(kept) / 1000:.1f} MW, peak {max(kept) / 1000:.1f} MW')
