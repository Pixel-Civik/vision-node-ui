import altair as alt
import pandas as pd

def palette():
    return {"enter": "#10B981", "exit": "#EF4444"}


def full_palette() -> dict:
    """Extended palette covering all event types."""
    return {
        "enter":   "#10B981",
        "exit":    "#EF4444",
        "pasante": "#6B7280",
        "visitor": "#3B82F6",
        "visit":   "#7C3AED",
    }

def utc_scale():
    return alt.Scale(type="utc")

def utc_scale_domain(domain):
    return alt.Scale(type="utc", domain=domain)

def with_hour_and_dow(f: pd.DataFrame) -> pd.DataFrame:
    out = f.copy()
    try:
        local_ts = out["ts"].dt.tz_convert("America/Lima")
    except Exception:
        local_ts = out["ts"]
    out["hour"] = local_ts.dt.hour
    out["dow"] = local_ts.dt.dayofweek
    out["local_date"] = local_ts.dt.floor("D")
    try:
        out["local_date"] = out["local_date"].dt.tz_localize(None)
    except Exception:
        pass
    return out

def bucket_age(v) -> str:
    if v is None:
        return "N/D"
    s = str(v).strip()
    if not s:
        return "N/D"
    low = s.lower()
    if "no_detect" in low or low in {"nd", "n/d", "na", "none"}:
        return "N/D"
    import re
    m = re.search(r"(\d+)\s*-\s*(\d+)", s)
    if m:
        return f"{int(m.group(1))}-{int(m.group(2))}"
    try:
        a = float(s)
    except Exception:
        return s
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
