import altair as alt
import pandas as pd
import streamlit as st
from .core.utils import utc_scale

def render_advanced(f: pd.DataFrame):
    st.subheader("Análisis Ejecutivo Avanzado")
    x1, x2 = st.columns([1.2, 1.0])
    with x1:
        st.markdown("**Ocupación Estimada (Entrada - Salida)**")
        occ_bucket = st.selectbox("Nivel de Granularidad", options=["15min", "1H", "1D"], index=1, key="occ_bucket")
        flow = f.copy()
        flow = flow[flow["event_type"].isin(["enter", "exit"])].copy()
        if flow.empty:
            st.info("Sin eventos entrada/salida para cálculo de ocupación.")
        else:
            flow["delta"] = flow["event_type"].map({"enter": 1, "exit": -1}).astype("int64")
            flow = flow.set_index("ts").sort_index()
            series = flow["delta"].resample(occ_bucket).sum().rename("net").to_frame().reset_index()
            series["occupancy"] = series["net"].cumsum().clip(lower=0)
            occ_chart = (
                alt.Chart(series)
                .mark_area(opacity=0.28, color="#2E86DE")
                .encode(
                    x=alt.X("ts:T", title="", scale=utc_scale()),
                    y=alt.Y("occupancy:Q", title="Personas (estimado)"),
                    tooltip=[alt.Tooltip("ts:T", title="Tiempo"), alt.Tooltip("occupancy:Q", title="Ocupación"), alt.Tooltip("net:Q", title="Neto")],
                )
                .properties(height=220)
            )
            st.altair_chart(occ_chart, use_container_width=True)
        st.markdown("**Promedio Móvil (eventos/día)**")
        d = f.copy()
        d["date"] = d["ts"].dt.floor("D")
        d = d.groupby(["date"], as_index=False).size().rename(columns={"size": "events"})
        d = d.sort_values("date")
        d["ma7"] = d["events"].rolling(7, min_periods=1).mean()
        base = alt.Chart(d).encode(x=alt.X("date:T", title=""))
        c_events = base.mark_bar(opacity=0.25, color="#7C3AED").encode(y=alt.Y("events:Q", title="Eventos"))
        c_ma = base.mark_line(color="#111827", strokeWidth=3).encode(y=alt.Y("ma7:Q", title=""))
        st.altair_chart((c_events + c_ma).properties(height=220), use_container_width=True)
    with x2:
        st.markdown("**Mapa de Calor: Día de Semana x Hora**")
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
            .properties(height=220)
        )
        st.altair_chart(heat, use_container_width=True)
        st.markdown("**Análisis Pareto por Zona (80/20)**")
        pz = f.copy()
        pz = pz.groupby(["zone_name"], as_index=False).size().rename(columns={"size": "events"})
        pz = pz.sort_values("events", ascending=False)
        pz["cum_events"] = pz["events"].cumsum()
        total = float(pz["events"].sum() or 1.0)
        pz["cum_pct"] = (pz["cum_events"] / total) * 100.0
        top = pz.head(12).copy()
        bars = (
            alt.Chart(top)
            .mark_bar(color="#10B981")
            .encode(
                y=alt.Y("zone_name:N", sort="-x", title=""),
                x=alt.X("events:Q", title="Eventos"),
                tooltip=["zone_name:N", "events:Q", alt.Tooltip("cum_pct:Q", format=".1f", title="% acumulado")],
            )
            .properties(height=260)
        )
        line = (
            alt.Chart(top)
            .mark_line(color="#EF4444", strokeWidth=3, point=True)
            .encode(
                y=alt.Y("zone_name:N", sort="-x", title=""),
                x=alt.X("cum_pct:Q", title="% acumulado", scale=alt.Scale(domain=[0, 100])),
                tooltip=[alt.Tooltip("cum_pct:Q", format=".1f", title="% acumulado")],
            )
        )
        st.altair_chart(alt.layer(bars, line).resolve_scale(x="independent"), use_container_width=True)
