import altair as alt
import pandas as pd
import streamlit as st
from .core.utils import utc_scale

def render_right_panel(f: pd.DataFrame, enters: int, exits: int, total_ev: int, start_ts, end_ts, pal: dict):
    st.subheader("Distribución Entrada/Salida")
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
    date_start = start_ts.date()
    date_end = end_ts.date()
    days = int((pd.Timestamp(date_end) - pd.Timestamp(date_start)).days) + 1
    st.subheader("Indicadores Promedio")
    st.metric("Eventos/día (promedio)", f"{round(total_ev / max(1, days), 2)}")
    if enters + exits > 0:
        st.metric("Porcentaje Entrada", f"{round((enters / max(1, enters + exits)) * 100.0, 1)}%")
        st.metric("Porcentaje Salida", f"{round((exits / max(1, enters + exits)) * 100.0, 1)}%")
    by_zone = f.copy().groupby(["zone_name", "event_type"], as_index=False).size()
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
    by_cam = f.copy().groupby(["channel", "event_type"], as_index=False).size()
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
