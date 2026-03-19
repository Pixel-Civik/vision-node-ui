import altair as alt
import pandas as pd
import streamlit as st
from .core.utils import bucket_age, with_hour_and_dow
from .data import supabase_rpc

def render_demographics(f: pd.DataFrame, start_ts, end_ts, ctx: dict):
    demo = f.copy()
    if "event_type" in demo.columns:
        demo = demo[demo["event_type"] == "enter"].copy()
    if demo.empty:
        return
    if "hour" not in demo.columns or "dow" not in demo.columns or "local_date" not in demo.columns:
        demo = with_hour_and_dow(demo)
    has_demo = demo.get("gender").notna().any() or demo.get("age").notna().any()
    if not has_demo:
        return
    st.subheader("Análisis Demográfico")
    sb_url = str(ctx.get("sb_url") or "").strip()
    sb_key = str(ctx.get("sb_key") or "").strip()
    payload = {
        "p_start_ts": start_ts.isoformat(),
        "p_end_ts": end_ts.isoformat(),
        "p_sites": ctx.get("sel_sites"),
        "p_channels": ctx.get("sel_channels"),
        "p_zones": ctx.get("sel_zones"),
        "p_hour_min": ctx.get("hour_min"),
        "p_hour_max": ctx.get("hour_max"),
        "p_dows": ctx.get("dow_sel"),
    }
    if demo.get("gender").notna().any():
        g1, g2 = st.columns([1.4, 1.0])
        gg = demo[demo["gender"].notna()].copy()
        with g1:
            st.markdown("**Distribución por Género: Promedio Horario**")
            hg = gg.groupby(["local_date", "hour", "gender"], as_index=False).size().rename(columns={"size": "count"})
            hg = hg.groupby(["hour", "gender"], as_index=False)["count"].mean().rename(columns={"count": "avg_count"})
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
            rows = supabase_rpc(sb_url, sb_key, "dashboard_demo_gender_total", payload) if sb_url and sb_key else []
            pct = pd.DataFrame(rows)
            if pct.empty:
                pct = gg.groupby("gender", as_index=False).size().rename(columns={"size": "count"})
            pct["count"] = pd.to_numeric(pct["count"], errors="coerce").fillna(0).astype(int)
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
        aa["age_bucket"] = aa["age"].apply(bucket_age)
        aa = aa[aa["age_bucket"].notna()].copy()
        aa = aa[aa["age_bucket"] != ""].copy()
        if aa.empty:
            with a1:
                st.caption("Datos insuficientes de edad.")
            with a2:
                st.caption("Datos insuficientes de edad.")
        else:
            with a1:
                st.markdown("**Edad: Promedio Horario**")
                ah = aa.groupby(["local_date", "hour", "age_bucket"], as_index=False).size().rename(columns={"size": "count"})
                ah = ah.groupby(["hour", "age_bucket"], as_index=False)["count"].mean().rename(columns={"count": "avg_count"})
                ch_age = (
                    alt.Chart(ah)
                    .mark_line(point=True, strokeWidth=3)
                    .encode(
                        x=alt.X("hour:O", title="Hora"),
                        y=alt.Y("avg_count:Q", title="Promedio"),
                        color=alt.Color("age_bucket:N", title=""),
                        tooltip=["hour:O", "age_bucket:N", alt.Tooltip("avg_count:Q", format=".2f", title="Promedio")],
                    )
                    .properties(height=240)
                )
                st.altair_chart(ch_age, use_container_width=True)
            with a2:
                st.markdown("**Edad: Distribución Total**")
                rows = supabase_rpc(sb_url, sb_key, "dashboard_demo_age_total", payload) if sb_url and sb_key else []
                ab = pd.DataFrame(rows)
                if not ab.empty:
                    ab = ab.rename(columns={"age": "age_bucket"})
                    ab["count"] = pd.to_numeric(ab["count"], errors="coerce").fillna(0).astype(int)
                else:
                    ab = aa.groupby("age_bucket", as_index=False).size().rename(columns={"size": "count"})
                total = float(ab["count"].sum() or 1.0)
                ab["pct"] = (ab["count"] / total) * 100.0
                pie_age = (
                    alt.Chart(ab)
                    .mark_arc(innerRadius=70)
                    .encode(
                        theta=alt.Theta("count:Q"),
                        color=alt.Color("age_bucket:N", title=""),
                        tooltip=["age_bucket:N", "count:Q", alt.Tooltip("pct:Q", format=".1f", title="%")],
                    )
                    .properties(height=240)
                )
                st.altair_chart(pie_age, use_container_width=True)
