import altair as alt
import pandas as pd
import streamlit as st
from .core.utils import utc_scale
from .data import supabase_rpc

def render_right_panel(f: pd.DataFrame, enters: int, exits: int, total_ev: int, start_ts, end_ts, pal: dict, ctx: dict):
    f = f[f["event_type"].isin(["enter", "exit"])].copy()
    st.subheader("Distribución Entrada/Salida")
    st.caption(
        "Muestra cómo se reparten los eventos entre entradas y salidas, "
        "qué zonas y cámaras concentran más actividad."
    )
    donut_df = pd.DataFrame([{"event_type": "enter", "count": enters}, {"event_type": "exit", "count": exits}])
    donut_df["pct"] = (donut_df["count"] / max(1, donut_df["count"].sum())) * 100.0
    donut = (
        alt.Chart(donut_df)
        .mark_arc(innerRadius=70)
        .encode(
            theta=alt.Theta("count:Q"),
            color=alt.Color("event_type:N", title="", scale=alt.Scale(domain=list(pal.keys()), range=list(pal.values()))),
            tooltip=["event_type:N", "count:Q", alt.Tooltip("pct:Q", format=".1f", title="%")],
        )
        .properties(height=240)
    )
    st.altair_chart(donut, use_container_width=True)
    sb_url = str(ctx.get("sb_url") or "").strip()
    sb_key = str(ctx.get("sb_key") or "").strip()
    payload = {
        "p_start_ts": start_ts.isoformat(),
        "p_end_ts": end_ts.isoformat(),
        "p_sites": ctx.get("sel_sites"),
        "p_channels": ctx.get("sel_channels"),
        "p_zones": ctx.get("sel_zones"),
        "p_events": ["enter", "exit"],
        "p_hour_min": ctx.get("hour_min"),
        "p_hour_max": ctx.get("hour_max"),
        "p_dows": ctx.get("dow_sel"),
    }
    kpi_rows = supabase_rpc(sb_url, sb_key, "dashboard_kpi", payload) if sb_url and sb_key else []
    kpi = kpi_rows[0] if kpi_rows else {}
    days = int(kpi.get("days") or 1)
    st.subheader("Indicadores Promedio")
    st.metric("Eventos/día (promedio)", f"{round(total_ev / max(1, days), 2)}")
    if enters + exits > 0:
        st.metric("Porcentaje Entrada", f"{round((enters / max(1, enters + exits)) * 100.0, 1)}%")
        st.metric("Porcentaje Salida", f"{round((exits / max(1, enters + exits)) * 100.0, 1)}%")
    by_zone_rows = supabase_rpc(sb_url, sb_key, "dashboard_breakdown_zone", payload) if sb_url and sb_key else []
    by_zone = pd.DataFrame(by_zone_rows) if by_zone_rows else pd.DataFrame(columns=["zone", "event_type", "count"])
    if not by_zone.empty:
        by_zone = by_zone.rename(columns={"zone": "zone_name", "count": "size"})
    if by_zone.empty:
        st.info("Sin datos de zona en el período seleccionado.")
    else:
        ch3 = (
            alt.Chart(by_zone)
            .mark_bar()
            .encode(
                y=alt.Y("zone_name:N", sort="-x", title="Zona"),
                x=alt.X("size:Q", title="Eventos"),
                color=alt.Color("event_type:N", title="Evento", scale=alt.Scale(domain=list(pal.keys()), range=list(pal.values()))),
                tooltip=["zone_name:N", "event_type:N", "size:Q"],
            )
            .properties(height=280)
        )
        st.altair_chart(ch3, use_container_width=True)
    by_cam_rows = supabase_rpc(sb_url, sb_key, "dashboard_breakdown_channel", payload) if sb_url and sb_key else []
    by_cam = pd.DataFrame(by_cam_rows) if by_cam_rows else pd.DataFrame(columns=["channel", "event_type", "count"])
    if not by_cam.empty:
        by_cam = by_cam.rename(columns={"count": "size"})
    if by_cam.empty:
        st.info("Sin datos de dispositivo en el período seleccionado.")
    else:
        ch4 = (
            alt.Chart(by_cam)
            .mark_bar()
            .encode(
                y=alt.Y("channel:N", sort="-x", title="Dispositivo"),
                x=alt.X("size:Q", title="Eventos"),
                color=alt.Color("event_type:N", title="Evento", scale=alt.Scale(domain=list(pal.keys()), range=list(pal.values()))),
                tooltip=["channel:N", "event_type:N", "size:Q"],
            )
            .properties(height=280)
        )
        st.altair_chart(ch4, use_container_width=True)
