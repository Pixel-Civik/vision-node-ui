import altair as alt
import pandas as pd
import streamlit as st
from .core.analytics import hourly_avg
from .core.utils import utc_scale, bucket_age

def render_demographics(f: pd.DataFrame):
    demo = f.copy()
    has_demo = demo.get("gender").notna().any() or demo.get("age").notna().any()
    if not has_demo:
        return
    st.subheader("Análisis Demográfico")
    if demo.get("gender").notna().any():
        g1, g2 = st.columns([1.4, 1.0])
        gg = demo[demo["gender"].notna()].copy()
        with g1:
            st.markdown("**Distribución por Género: Promedio Horario**")
            hg = hourly_avg(gg, col="gender", value_name="avg_count")
            if hg.empty:
                st.caption("Datos insuficientes.")
            else:
                chg = (
                    alt.Chart(hg)
                    .mark_line(point=True, strokeWidth=3)
                    .encode(
                        x=alt.X("hour:O", title="Hora"),
                        y=alt.Y("avg_count:Q", title="Promedio"),
                        color=alt.Color("gender:N", title=""),
                        tooltip=["hour:O", "gender:N", alt.Tooltip("avg_count:Q", format=".2f", title="Promedio")],
                    )
                    .properties(height=240)
                )
                st.altair_chart(chg, use_container_width=True)
        with g2:
            st.markdown("**Distribución por Género: Porcentaje Total**")
            pct = gg.groupby("gender", as_index=False).size().rename(columns={"size": "count"})
            pct["pct"] = (pct["count"] / max(1, pct["count"].sum())) * 100.0
            dp = (
                alt.Chart(pct)
                .mark_arc(innerRadius=70)
                .encode(
                    theta=alt.Theta("count:Q"),
                    color=alt.Color("gender:N", title=""),
                    tooltip=["gender:N", "count:Q", alt.Tooltip("pct:Q", format=".1f", title="%")],
                )
                .properties(height=240)
            )
            st.altair_chart(dp, use_container_width=True)
        st.markdown("**Distribución por Género: Análisis Diario**")
        gd = gg.copy()
        gd = gd.groupby(["dow", "gender"], as_index=False).size().rename(columns={"size": "count"})
        gd["dow_name"] = gd["dow"].map({0: "Lunes", 1: "Martes", 2: "Miércoles", 3: "Jueves", 4: "Viernes", 5: "Sábado", 6: "Domingo"})
        gd["dow_name"] = pd.Categorical(gd["dow_name"], categories=["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"], ordered=True)
        if not gd.empty:
            cgday = (
                alt.Chart(gd)
                .mark_bar()
                .encode(
                    x=alt.X("dow_name:N", title=""),
                    y=alt.Y("count:Q", title="Eventos"),
                    color=alt.Color("gender:N", title=""),
                    tooltip=["dow_name:N", "gender:N", "count:Q"],
                )
                .properties(height=220)
            )
            st.altair_chart(cgday, use_container_width=True)
    if demo.get("age").notna().any():
        a1, a2 = st.columns([1.4, 1.0])
        aa = demo[demo["age"].notna()].copy()
        aa["age"] = pd.to_numeric(aa["age"], errors="coerce")
        aa = aa[aa["age"].notna()].copy()
        if aa.empty:
            with a1:
                st.caption("Sin edad numérica válida.")
            with a2:
                st.caption("Sin edad numérica válida.")
        else:
            with a1:
                st.markdown("**Edad: Promedio Diario**")
                aa["date"] = aa["ts"].dt.floor("D")
                ad = aa.groupby("date", as_index=False)["age"].mean().rename(columns={"age": "age_avg"})
                ca2 = (
                    alt.Chart(ad)
                    .mark_line(point=True, strokeWidth=3, color="#7C3AED")
                    .encode(
                        x=alt.X("date:T", title="Fecha", scale=utc_scale()),
                        y=alt.Y("age_avg:Q", title="Edad promedio"),
                        tooltip=["date:T", alt.Tooltip("age_avg:Q", format=".1f", title="Edad promedio")],
                    )
                    .properties(height=240)
                )
                st.altair_chart(ca2, use_container_width=True)
            with a2:
                st.markdown("**Edad: Distribución por Rangos**")
                aa["age_bucket"] = aa["age"].apply(bucket_age)
                ab = aa.groupby("age_bucket", as_index=False).size().rename(columns={"size": "count"})
                ab["pct"] = (ab["count"] / max(1, ab["count"].sum())) * 100.0
                cab = (
                    alt.Chart(ab)
                    .mark_bar(color="#2E86DE")
                    .encode(
                        y=alt.Y("age_bucket:N", sort="-x", title=""),
                        x=alt.X("pct:Q", title="%"),
                        tooltip=["age_bucket:N", "count:Q", alt.Tooltip("pct:Q", format=".1f", title="%")],
                    )
                    .properties(height=240)
                )
                st.altair_chart(cab, use_container_width=True)
