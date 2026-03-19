import altair as alt
import pandas as pd
import streamlit as st

from ..data import supabase_rpc


def render_facade_compare(ctx: dict) -> None:
    st.subheader("Pasantes vs Visitantes")

    sb_url = str(ctx.get("sb_url") or "").strip()
    sb_key = str(ctx.get("sb_key") or "").strip()
    if not sb_url or not sb_key:
        st.warning("Faltan credenciales de Supabase en el .env.")
        return

    base_payload = {
        "p_start_ts": ctx["start_ts"].isoformat(),
        "p_end_ts": ctx["end_ts"].isoformat(),
        "p_sites": ctx.get("sel_sites"),
        "p_channels": ctx.get("sel_channels"),
        "p_zones": ctx.get("sel_zones"),
        "p_hour_min": None,
        "p_hour_max": None,
        "p_dows": ctx.get("dow_sel"),
    }

    kpi_pas_rows = supabase_rpc(sb_url, sb_key, "dashboard_kpi", {**base_payload, "p_events": ["pasante"]})
    kpi_ent_rows = supabase_rpc(sb_url, sb_key, "dashboard_kpi", {**base_payload, "p_events": ["enter"]})
    kpi_pas = kpi_pas_rows[0] if kpi_pas_rows else {}
    kpi_ent = kpi_ent_rows[0] if kpi_ent_rows else {}
    pas_total = int(kpi_pas.get("total") or 0)
    ent_total = int(kpi_ent.get("total") or 0)
    days = int(max(int(kpi_pas.get("days") or 1), int(kpi_ent.get("days") or 1), 1))

    c1, c2, c3 = st.columns(3)
    c1.metric("Pasantes (total)", f"{pas_total}", f"{round(pas_total / days, 2)} / día")
    c2.metric("Visitantes (ingreso, total)", f"{ent_total}", f"{round(ent_total / days, 2)} / día")
    conv = (ent_total / pas_total) * 100.0 if pas_total > 0 else 0.0
    c3.metric("Conversión (enter / pasante)", f"{round(conv, 2)}%")

    by_hour_rows = supabase_rpc(sb_url, sb_key, "dashboard_hourly_totals", {**base_payload, "p_events": ["pasante", "enter"]})
    by_hour = pd.DataFrame(by_hour_rows)
    if by_hour.empty:
        st.info("No hay datos de pasantes/visitantes en el rango seleccionado.")
        return
    by_hour["hour"] = pd.to_numeric(by_hour["hour"], errors="coerce").fillna(0).astype(int)
    by_hour["count"] = pd.to_numeric(by_hour["count"], errors="coerce").fillna(0).astype(int)
    by_hour = by_hour[by_hour["event_type"].isin(["pasante", "enter"])].copy()
    by_hour["label"] = by_hour["event_type"].map({"pasante": "Pasantes", "enter": "Visitantes (ingreso)"})

    st.markdown("**Conteo por Hora (Lima)**")
    ch_hour = (
        alt.Chart(by_hour)
        .mark_bar()
        .encode(
            x=alt.X("hour:O", title="Hora (Lima)"),
            y=alt.Y("count:Q", title="Cantidad"),
            color=alt.Color("label:N", title=""),
            tooltip=["hour:O", "label:N", "count:Q"],
        )
        .properties(height=240)
    )
    st.altair_chart(ch_hour, use_container_width=True)

    ts_rows = supabase_rpc(sb_url, sb_key, "dashboard_timeseries_hourly", {**base_payload, "p_events": ["pasante", "enter"]})
    ts = pd.DataFrame(ts_rows)
    if ts.empty:
        return
    ts["count"] = pd.to_numeric(ts["count"], errors="coerce").fillna(0).astype(int)
    ts = ts[ts["event_type"].isin(["pasante", "enter"])].copy()
    ts["label"] = ts["event_type"].map({"pasante": "Pasantes", "enter": "Visitantes (ingreso)"})
    st.markdown("**Serie por Hora (Lima)**")
    ch_ts = (
        alt.Chart(ts)
        .mark_line(point=True, strokeWidth=3)
        .encode(
            x=alt.X("local_ts_hour:T", title="Tiempo"),
            y=alt.Y("count:Q", title="Cantidad"),
            color=alt.Color("label:N", title=""),
            tooltip=[alt.Tooltip("local_ts_hour:T", title="Tiempo", format="%d %b %H:%M"), "label:N", "count:Q"],
        )
        .properties(height=260)
    )
    st.altair_chart(ch_ts, use_container_width=True)
