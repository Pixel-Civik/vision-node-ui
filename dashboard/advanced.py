import altair as alt
import pandas as pd
import streamlit as st
from .core.utils import with_hour_and_dow

def render_advanced(f: pd.DataFrame):
    st.subheader("Mapa de Calor: Día de Semana x Hora")
    hm = f[f["event_type"].isin(["enter", "exit"])].copy()
    hm = with_hour_and_dow(hm)
    hm["dow_name"] = hm["dow"].map({0: "Lunes", 1: "Martes", 2: "Miércoles", 3: "Jueves", 4: "Viernes", 5: "Sábado", 6: "Domingo"})
    hm["dow_name"] = pd.Categorical(hm["dow_name"], categories=["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"], ordered=True)
    hm = hm.groupby(["dow_name", "hour"], as_index=False).size()
    heat = (
        alt.Chart(hm)
        .mark_rect(cornerRadius=4)
        .encode(
            x=alt.X("hour:O", title="Hora"),
            y=alt.Y("dow_name:N", title=""),
            color=alt.Color("size:Q", title="Eventos", scale=alt.Scale(scheme="tealblues")),
            tooltip=["dow_name:N", "hour:O", "size:Q"],
        )
        .properties(height=380)
    )
    st.altair_chart(heat, use_container_width=True)
