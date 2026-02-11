import altair as alt
import pandas as pd

def palette():
    return {"enter": "#10B981", "exit": "#EF4444"}

def utc_scale():
    return alt.Scale(type="utc")

def utc_scale_domain(domain):
    return alt.Scale(type="utc", domain=domain)

def with_hour_and_dow(f: pd.DataFrame) -> pd.DataFrame:
    out = f.copy()
    try:
        local_ts = out["ts"].dt.tz_convert("America/Lima")
    except Exception:
        local_ts = out["ts"].dt.tz_convert(pd.Timedelta(hours=-5))
    out["hour"] = local_ts.dt.hour
    out["dow"] = local_ts.dt.dayofweek
    out["local_date"] = local_ts.dt.floor("D")
    return out

def bucket_age(v) -> str:
    try:
        a = float(v)
    except Exception:
        return "N/D"
    if a < 0:
        return "N/D"
    if a < 18:
        return "0-17"
    if a < 25:
        return "18-24"
    if a < 35:
        return "25-34"
    if a < 45:
        return "35-44"
    if a < 55:
        return "45-54"
    if a < 65:
        return "55-64"
    return "65+"
