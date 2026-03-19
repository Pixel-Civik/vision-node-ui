from __future__ import annotations

import os
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
from .traffic import render_traffic


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

    sb_url = os.getenv("SUPABASE_URL", "")
    sb_key = os.getenv("SUPABASE_ANON_KEY", "") or os.getenv("SUPABASE_KEY", "")
    ctx = {
        "sb_url": sb_url,
        "sb_key": sb_key,
        "start_ts": start_ts,
        "end_ts": end_ts,
        "sel_sites": sel_sites or None,
        "sel_channels": sel_channels or None,
        "sel_zones": sel_zones or None,
        "sel_events": sel_events or None,
        "hour_min": int(hour_min),
        "hour_max": int(hour_max),
        "dow_sel": dow_sel or None,
        "metric_mode": metric_mode,
        "source_name": source_name,
    }

    start_ts_exec = start_ts
    end_ts_exec = end_ts
    if align_series and sel_channels and len(sel_channels) > 1:
        base_align = df.copy()
        base_align = base_align[(base_align["ts"] >= start_ts) & (base_align["ts"] <= end_ts)]
        if sel_sites:
            base_align = base_align[base_align["site"].isin(sel_sites)]
        if sel_channels:
            base_align = base_align[base_align["channel"].isin(sel_channels)]
        if sel_zones:
            base_align = base_align[base_align["zone_name"].isin(sel_zones)]
        base_align = base_align[base_align["event_type"].isin(["enter", "exit"])]
        if not base_align.empty:
            mm = base_align.groupby("channel")["ts"].agg(["min", "max"]).dropna()
            if len(mm) >= 2:
                start_ts_exec = mm["min"].max()
                end_ts_exec = mm["max"].min()
                if start_ts_exec > end_ts_exec:
                    start_ts_exec = start_ts
                    end_ts_exec = end_ts

    f = apply_data_filters(df, start_ts_exec, end_ts_exec, sel_sites, sel_channels, sel_zones, sel_events, hour_min, hour_max, dow_sel, apply_hour_filter=True)
    f_traffic = apply_data_filters(df, start_ts, end_ts, sel_sites, sel_channels, [], [], hour_min, hour_max, dow_sel, apply_hour_filter=False)
    if f.empty:
        if not f_traffic.empty:
            st.warning("Hay eventos en el período seleccionado, pero el filtro horario los está ocultando. Ajusta el rango horario (p.ej. 0–23) o usa un preset sin recorte por horas.")
            f = f_traffic.copy()
        else:
            st.warning("No se encontraron eventos con los filtros seleccionados.")
            return

    pal = palette_utils()
    f_ee = f[f["event_type"].isin(["enter", "exit"])].copy()
    enters, exits, total_ev = render_exec_metrics(ctx, start_ts_exec, end_ts_exec)
    f_ee_all = f_traffic[f_traffic["event_type"].isin(["enter", "exit"])].copy()
    exits_all = int((f_ee_all["event_type"] == "exit").sum()) if not f_ee_all.empty else 0
    enters_all = int((f_ee_all["event_type"] == "enter").sum()) if not f_ee_all.empty else 0

    has_pasantes = bool((f_traffic["event_type"] == "pasante").any())
    has_visits = bool((f_traffic["event_type"] == "visit").any())
    has_enters = bool((f_traffic["event_type"] == "enter").any())
    has_visitors = bool((f_traffic["event_type"] == "visitor").any())
    tab_labels = ["Resumen Ejecutivo"]
    if has_pasantes or has_visits or has_enters or has_visitors:
        tab_labels.append("Visitantes y Colas")
    tab_labels.append("Detalle de Datos")
    tabs = st.tabs(tab_labels)
    with tabs[0]:
        if exits == 0 and exits_all > 0:
            st.warning(f"Hay {exits_all} salidas fuera del rango horario/días seleccionados.")
        if enters == 0 and enters_all > 0:
            st.warning(f"Hay {enters_all} entradas fuera del rango horario/días seleccionados.")
        with st.expander("Validación de conteo (enter/exit)", expanded=False):
            def _fmt_lima(ts: pd.Timestamp) -> str:
                try:
                    return ts.tz_convert("America/Lima").strftime("%Y-%m-%d %H:%M")
                except Exception:
                    return (ts.tz_convert("UTC") + pd.Timedelta(hours=-5)).strftime("%Y-%m-%d %H:%M")

            st.caption(f"Rango seleccionado: {_fmt_lima(start_ts)} → {_fmt_lima(end_ts)} (Lima)")
            st.caption(f"Rango aplicado a enter/exit: {_fmt_lima(start_ts_exec)} → {_fmt_lima(end_ts_exec)} (Lima)")

            if not f_ee.empty and "channel" in f_ee.columns:
                by_ch = f_ee.groupby(["channel", "event_type"], as_index=False).size().rename(columns={"size": "count"}).sort_values(["channel", "event_type"])
                st.markdown("**Conteo por canal (rango aplicado + horario)**")
                st.dataframe(by_ch, use_container_width=True, hide_index=True)
            if not f_ee_all.empty and "channel" in f_ee_all.columns:
                by_ch_all = f_ee_all.groupby(["channel", "event_type"], as_index=False).size().rename(columns={"size": "count"}).sort_values(["channel", "event_type"])
                st.markdown("**Conteo por canal (período sin recorte horario)**")
                st.dataframe(by_ch_all, use_container_width=True, hide_index=True)

            if not f_ee_all.empty and "zone_name" in f_ee_all.columns:
                by_zone = f_ee_all.groupby(["zone_name", "event_type"], as_index=False).size().rename(columns={"size": "count"}).sort_values("count", ascending=False)
                st.markdown("**Conteo por zona (período sin recorte horario)**")
                st.dataframe(by_zone, use_container_width=True, hide_index=True)

            bounce_base = f_ee_all.copy()
            bounce_base = bounce_base[bounce_base["track_id"].notna()].copy()
            if not bounce_base.empty and "track_id" in bounce_base.columns:
                bounce_base = bounce_base.sort_values(["channel", "track_id", "ts"])
                bounce_base["next_event"] = bounce_base.groupby(["channel", "track_id"])["event_type"].shift(-1)
                bounce_base["next_ts"] = bounce_base.groupby(["channel", "track_id"])["ts"].shift(-1)
                bounce_base["delta_s"] = (bounce_base["next_ts"] - bounce_base["ts"]).dt.total_seconds()
                rebote = bounce_base[(bounce_base["event_type"] == "exit") & (bounce_base["next_event"] == "enter") & (bounce_base["delta_s"] <= 4)].copy()
                if not rebote.empty:
                    st.warning(f"Se detectaron {int(len(rebote))} reingresos rápidos (exit→enter <= 4s). Posible 'rebote' de tracking.")
                    if "channel" in rebote.columns:
                        by_rebote = rebote.groupby("channel", as_index=False).size().rename(columns={"size": "pairs"}).sort_values("pairs", ascending=False)
                        st.dataframe(by_rebote, use_container_width=True, hide_index=True)
                else:
                    st.caption("No se detectaron reingresos rápidos (exit→enter <= 4s) en el período.")
        left, right = st.columns([2, 1])
        with left:
            st.subheader("Análisis de Patrones de Comportamiento")
            render_behavior(f_ee if not f_ee.empty else f, start_ts_exec, end_ts_exec, metric_mode, pal)
        with right:
            render_right_panel(f_ee if not f_ee.empty else f, enters, exits, total_ev, start_ts_exec, end_ts_exec, pal, ctx)
        render_advanced(f_ee if not f_ee.empty else f, start_ts_exec, end_ts_exec, ctx)
        render_demographics(f_ee if not f_ee.empty else f, start_ts_exec, end_ts_exec, ctx)
    idx = 1
    if has_pasantes or has_visits or has_enters:
        with tabs[idx]:
            render_traffic(f_traffic, ctx)
        idx += 1
    with tabs[idx]:
        render_table(f)
