import altair as alt
import pandas as pd
import streamlit as st

def render_advanced(f: pd.DataFrame):
    st.subheader("Mapa de Calor: Día de Semana x Hora")
    hm = f.copy()
    hm["dow"] = hm["ts"].dt.day_name()
    hm["hour"] = hm["ts"].dt.hour
    order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    hm["dow"] = pd.Categorical(hm["dow"], categories=order, ordered=True)
    hm = hm.groupby(["dow", "hour"], as_index=False).size()
    heat = (
        alt.Chart(hm)
        .mark_rect(cornerRadius=4)
        .encode(
            x=alt.X("hour:O", title="Hora"),
            y=alt.Y("dow:N", title=""),
            color=alt.Color("size:Q", title="Eventos", scale=alt.Scale(scheme="tealblues")),
            tooltip=["dow:N", "hour:O", "size:Q"],
        )
        .properties(height=380)
    )
    st.altair_chart(heat, use_container_width=True)
