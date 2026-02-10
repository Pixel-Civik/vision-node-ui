import pandas as pd

def ts_metric(f: pd.DataFrame, bucket: str, metric: str) -> pd.DataFrame:
    base = f.copy()
    base = base[base["ts"].notna()].copy()
    base = base.set_index("ts").sort_index()
    if metric == "personas":
        if "track_id" not in base.columns:
            g = base.groupby("event_type").resample(bucket).size().rename("count").reset_index()
            return g
        g = (
            base.groupby(["event_type", pd.Grouper(freq=bucket)])["track_id"]
            .nunique(dropna=True)
            .rename("count")
            .reset_index()
            .rename(columns={"ts": "ts"})
        )
        return g
    g = base.groupby("event_type").resample(bucket).size().rename("count").reset_index()
    return g

def hourly_avg(f: pd.DataFrame, col: str, value_name: str) -> pd.DataFrame:
    a = f.copy()
    a = a[a["ts"].notna()].copy()
    a["date"] = a["ts"].dt.floor("D")
    a["hour"] = a["ts"].dt.hour
    a = a.groupby(["date", "hour", col], as_index=False).size().rename(columns={"size": value_name})
    a = a.groupby(["hour", col], as_index=False)[value_name].mean()
    return a
