from __future__ import annotations

import pandas as pd
import streamlit as st

from ..components.time_range import build_time_range
from ..components.filters import build_sidebar_filters
from ..core.data_filters import apply_filters as apply_data_filters
from ..components.metrics import render_metrics as render_exec_metrics
from .behavior import render_behavior
from ..right_panel import render_right_panel
from ..advanced import render_advanced
from ..demographics import render_demographics
from ..components.table import render_table
from ..core.utils import palette as palette_utils


def _date_range(df: pd.DataFrame) -> tuple[pd.Timestamp, pd.Timestamp]:
    s = df["ts"].dropna()
    if s.empty:
        now = pd.Timestamp.utcnow().tz_localize("UTC")
        return now, now
    return s.min(), s.max()


def render_dashboard(df_raw: pd.DataFrame, source_name: str) -> None:
    df = df_raw.copy()
    df = df[df["ts"].notna()].copy()
    df["site"] = df["site"].astype("string")
    df["channel"] = df["channel"].astype("string")
    df["zone_name"] = df["zone_name"].astype("string")
    df["event_type"] = df["event_type"].astype("string")

    min_ts, max_ts = _date_range(df)
    min_d = min_ts.date()
    max_d = max_ts.date()

    common_max_ts = max_ts
    if "channel" in df.columns:
        max_per_channel = df.groupby("channel")["ts"].max()
        if not max_per_channel.empty:
            common_max_ts = max_per_channel.min()
    default_end_date = common_max_ts.date()

    sites = sorted([s for s in df["site"].dropna().unique().tolist() if str(s).strip()])
    channels = sorted([c for c in df["channel"].dropna().unique().tolist() if str(c).strip()])
    zones = sorted([z for z in df["zone_name"].dropna().unique().tolist() if str(z).strip()])
    events = sorted([e for e in df["event_type"].dropna().unique().tolist() if str(e).strip()])

    start_ts, end_ts, _tz = build_time_range(df, min_d, max_d, default_end_date)
    with st.sidebar:
        sel_sites, sel_channels, sel_zones, sel_events, hour_min, hour_max, dow_sel, align_series, metric_mode = build_sidebar_filters(sites, channels, zones, events)

    f = apply_data_filters(df, start_ts, end_ts, sel_sites, sel_channels, sel_zones, sel_events, hour_min, hour_max, dow_sel)
    if f.empty:
        st.warning("No se encontraron eventos con los filtros seleccionados.")
        return

    pal = palette_utils()
    enters, exits, total_ev = render_exec_metrics(f)

    t1, t2 = st.tabs(["Resumen Ejecutivo", "Detalle de Datos"])
    with t1:
        left, right = st.columns([2, 1])
        with left:
            st.subheader("Análisis de Patrones de Comportamiento")
            render_behavior(f, start_ts, end_ts, metric_mode, pal)
        with right:
            render_right_panel(f, enters, exits, total_ev, start_ts, end_ts, pal)
        render_advanced(f)
        render_demographics(f)
    with t2:
        render_table(f)
