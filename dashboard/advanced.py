import altair as alt
import pandas as pd
import streamlit as st
from .data import supabase_rpc

def render_advanced(f: pd.DataFrame, start_ts, end_ts, ctx: dict):
    st.subheader("Mapa de Calor: Día de Semana x Hora")
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
    rows = supabase_rpc(sb_url, sb_key, "dashboard_heatmap_dow_hour", payload) if sb_url and sb_key else []
    hm = pd.DataFrame(rows)
    if hm.empty:
        st.info("Sin datos para mapa de calor.")
        return
    hm["dow_name"] = hm["dow"].map({0: "Lunes", 1: "Martes", 2: "Miércoles", 3: "Jueves", 4: "Viernes", 5: "Sábado", 6: "Domingo"})
    hm["dow_name"] = pd.Categorical(hm["dow_name"], categories=["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"], ordered=True)
    hm = hm.groupby(["dow_name", "hour"], as_index=False)["count"].sum()
    heat = (
        alt.Chart(hm)
        .mark_rect(cornerRadius=4)
        .encode(
            x=alt.X("hour:O", title="Hora"),
            y=alt.Y("dow_name:N", title=""),
            color=alt.Color("count:Q", title="Eventos", scale=alt.Scale(scheme="tealblues")),
            tooltip=["dow_name:N", "hour:O", "count:Q"],
        )
        .properties(height=380)
    )
    st.altair_chart(heat, use_container_width=True)
