"""
Distill the raw ~24.5M-row Malaysia weather CSV into a compact, cleaned
Kuala Lumpur aggregate used by the Weather Intelligence section.

Streams the CSV in chunks (never loads it all into memory), filters KL records,
parses timestamps, and produces monthly + hourly means for each metric plus
dynamically-derived engineering insights. Output: src/data/kl_weather.json
"""
import json
import os
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CSV = os.path.join(ROOT, "public", "data", "weather_data.csv")
OUT = os.path.join(ROOT, "src", "data", "kl_weather.json")

# Columns we actually consume (keeps chunk parsing fast + memory low)
USECOLS = [
    "datetime", "state", "temperature", "humidity", "wind_speed",
    "solar_radiation", "uv_index", "precipitation_rate", "feels_like_temperature",
]
METRICS = [
    "temperature", "humidity", "wind_speed", "solar_radiation",
    "uv_index", "precipitation_rate", "feels_like_temperature",
]

# sum / count accumulators keyed by month (1-12) and hour (0-23)
month_sum = {m: {k: 0.0 for k in METRICS} for m in range(1, 13)}
month_cnt = {m: {k: 0 for k in METRICS} for m in range(1, 13)}
hour_sum = {h: {k: 0.0 for k in METRICS} for h in range(24)}
hour_cnt = {h: {k: 0 for k in METRICS} for h in range(24)}

years = set()
total_rows = 0

print("Streaming CSV in chunks (filtering Kuala Lumpur)...")
reader = pd.read_csv(CSV, usecols=USECOLS, chunksize=2_000_000, low_memory=False)
for i, chunk in enumerate(reader):
    kl = chunk[chunk["state"] == "Kuala Lumpur"].copy()
    if kl.empty:
        continue
    dt = pd.to_datetime(kl["datetime"], errors="coerce")
    kl = kl[dt.notna()]
    dt = dt[dt.notna()]
    kl["_month"] = dt.dt.month
    kl["_hour"] = dt.dt.hour
    years.update(int(y) for y in dt.dt.year.unique())
    total_rows += len(kl)

    for m, g in kl.groupby("_month"):
        for k in METRICS:
            v = pd.to_numeric(g[k], errors="coerce").dropna()
            month_sum[int(m)][k] += float(v.sum())
            month_cnt[int(m)][k] += int(v.count())
    for h, g in kl.groupby("_hour"):
        for k in METRICS:
            v = pd.to_numeric(g[k], errors="coerce").dropna()
            hour_sum[int(h)][k] += float(v.sum())
            hour_cnt[int(h)][k] += int(v.count())
    print(f"  chunk {i}: +{len(kl):,} KL rows (running {total_rows:,})")

MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def mean(sums, cnts, m, k, nd=1):
    c = cnts[m][k]
    return round(sums[m][k] / c, nd) if c else None


monthly = []
for m in range(1, 13):
    monthly.append({
        "month": m,
        "name": MONTH_NAMES[m - 1],
        "temperature": mean(month_sum, month_cnt, m, "temperature"),
        "feelsLike": mean(month_sum, month_cnt, m, "feels_like_temperature"),
        "humidity": mean(month_sum, month_cnt, m, "humidity"),
        "windSpeed": mean(month_sum, month_cnt, m, "wind_speed"),
        "solar": mean(month_sum, month_cnt, m, "solar_radiation"),
        "uvIndex": mean(month_sum, month_cnt, m, "uv_index"),
        "rainfall": mean(month_sum, month_cnt, m, "precipitation_rate", 2),
    })

hourly = []
for h in range(24):
    hourly.append({
        "hour": h,
        "temperature": mean(hour_sum, hour_cnt, h, "temperature"),
        "humidity": mean(hour_sum, hour_cnt, h, "humidity"),
        "windSpeed": mean(hour_sum, hour_cnt, h, "wind_speed"),
        "solar": mean(hour_sum, hour_cnt, h, "solar_radiation"),
        "uvIndex": mean(hour_sum, hour_cnt, h, "uv_index"),
        "rainfall": mean(hour_sum, hour_cnt, h, "precipitation_rate", 2),
    })


def overall(k, nd=1):
    s = sum(month_sum[m][k] for m in range(1, 13))
    c = sum(month_cnt[m][k] for m in range(1, 13))
    return round(s / c, nd) if c else None


overall_stats = {
    "temperature": overall("temperature"),
    "humidity": overall("humidity"),
    "rainfall": overall("precipitation_rate", 2),
    "windSpeed": overall("wind_speed"),
    "solar": overall("solar_radiation"),
    "uvIndex": overall("uv_index"),
}


def top_months(key, n=2, reverse=True):
    vals = [(x["name"], x[key]) for x in monthly if x[key] is not None]
    vals.sort(key=lambda t: t[1], reverse=reverse)
    return [name for name, _ in vals[:n]]


# hour with max solar / temperature -> shading + cooling insight
solar_hours = [(x["hour"], x["solar"]) for x in hourly if x["solar"] is not None]
temp_hours = [(x["hour"], x["temperature"]) for x in hourly if x["temperature"] is not None]
peak_solar_hour = max(solar_hours, key=lambda t: t[1])[0] if solar_hours else 13
peak_temp_hour = max(temp_hours, key=lambda t: t[1])[0] if temp_hours else 14

insights = {
    "peakSolarMonths": top_months("solar", 3),
    "peakRainfallMonth": top_months("rainfall", 1)[0] if any(x["rainfall"] for x in monthly) else None,
    "peakWindMonths": top_months("windSpeed", 2),
    "peakHumidityMonth": top_months("humidity", 1)[0] if any(x["humidity"] for x in monthly) else None,
    "peakSolarHour": peak_solar_hour,
    "peakTempHour": peak_temp_hour,
}

result = {
    "meta": {
        "source": "Kaggle · shahmirvarqha/weather-data-malaysia",
        "region": "Kuala Lumpur, Malaysia",
        "records": total_rows,
        "yearStart": min(years) if years else None,
        "yearEnd": max(years) if years else None,
    },
    "overall": overall_stats,
    "monthly": monthly,
    "hourly": hourly,
    "insights": insights,
}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(result, f, indent=2)

print(f"\nWrote {OUT}")
print(f"KL rows: {total_rows:,} | years {result['meta']['yearStart']}-{result['meta']['yearEnd']}")
print(json.dumps(overall_stats, indent=2))
print("insights:", json.dumps(insights, indent=2))