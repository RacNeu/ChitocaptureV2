"""
Builds test-data/masteel/masteel-halfhourly-test.csv: ILLUSTRATIVE half-hourly demand (kW) for
1 Aug - 31 Oct 2026, for testing the Load profile upload. Masteel does not publish meter data.

Scaled to Masteel's real published FY2024 electricity: 398,450,750 kWh a year
(Sustainability Report FY2024 p.51) -> about 45.5 MW average demand.

Shape (typical of an induction-furnace meltshop plus rolling mill, not measured):
- base load about 14 MW (auxiliaries, fume extraction, compressors, cooling water)
- induction furnaces cycle heat by heat, three shifts, 24/7
- Sunday 08:00-20:00 maintenance stop: furnaces idle, auxiliaries stay on
- rolling mill runs mostly 07:00-23:00
- short random delays
- one coincident peak a month (2nd Tuesday, 14:00-15:00): mill restart while all furnaces melt
- a few missing readings (meter gap on 17 Sep) to test the gap warning

Run: python samples/make_masteel_halfhourly.py
"""
import csv
import random
from datetime import datetime, timedelta
from pathlib import Path

random.seed(50001)
TARGET_AVG_KW = 398_450_750 / 8760

start, end = datetime(2026, 8, 1), datetime(2026, 11, 1)
raw = []
t = start
while t < end:
    h = t.hour + t.minute / 60
    dow = t.isoweekday()  # 7 = Sunday
    stop = dow == 7 and 8 <= h < 20
    peak = 8 <= t.day <= 14 and dow == 2 and 14 <= h < 15
    delay = not peak and random.random() < 0.05
    furnace = 0.04 if stop or delay else 1.0 if peak else 0.55 + 0.3 * random.random()
    mill = 0.0 if stop else 1.0 if peak else (0.8 + 0.2 * random.random() if 7 <= h < 23 else 0.15)
    kw = 14_000 + 38_000 * furnace + 9_000 * mill + random.gauss(0, 600)
    gap = t.month == 9 and t.day == 17 and 10 <= h < 13
    raw.append((t, None if gap else kw))
    t += timedelta(minutes=30)

values = [v for _, v in raw if v is not None]
scale = TARGET_AVG_KW / (sum(values) / len(values))

out = Path(__file__).resolve().parent.parent / 'test-data' / 'masteel' / 'masteel-halfhourly-test.csv'
with out.open('w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['timestamp', 'kW'])
    for when, v in raw:
        if v is not None:
            w.writerow([when.strftime('%Y-%m-%d %H:%M'), round(v * scale)])

kept = [v * scale for v in values]
print(f'{out.name}: {len(kept)} readings, {len(raw) - len(kept)} missing, avg {sum(kept) / len(kept) / 1000:.1f} MW, peak {max(kept) / 1000:.1f} MW')
