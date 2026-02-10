import pandas as pd
from .utils import with_hour_and_dow

def apply_filters(df: pd.DataFrame, start_ts, end_ts, sel_sites, sel_channels, sel_zones, sel_events, show_presence, hour_min, hour_max, dow_sel):
    f = df.copy()
    f = f[(f["ts"] >= start_ts) & (f["ts"] <= end_ts)]
    if sel_sites:
        f = f[f["site"].isin(sel_sites)]
    if sel_channels:
        f = f[f["channel"].isin(sel_channels)]
    if sel_zones:
        f = f[f["zone_name"].isin(sel_zones)]
    if sel_events:
        f = f[f["event_type"].isin(sel_events)]
    if not show_presence:
        f = f[f["event_type"].isin(["enter", "exit"])]
    f = with_hour_and_dow(f)
    f = f[(f["hour"] >= hour_min) & (f["hour"] <= hour_max)]
    if dow_sel:
        f = f[f["dow"].isin(dow_sel)]
    return f
