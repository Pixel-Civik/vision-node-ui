import altair as alt
import pandas as pd
import streamlit as st

from ..data import supabase_rpc


def _fmt_hour_label(h: int) -> str:
    from datetime import datetime as dt_lib
    return dt_lib(2000, 1, 1, int(h), 0).strftime("%I %p").lstrip("0")


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

    kpi_pas_rows = supabase_rpc(sb_url, sb_key, "dashboard_kpi", {**base_payload, "p_events": ["pasante", "visitor"]})
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
    c3.metric("Conversión (enter / pasantes)", f"{round(conv, 2)}%")

    avg_rows = supabase_rpc(
        sb_url,
        sb_key,
        "facade_hourly_avg",
        {
            "p_start_ts": base_payload["p_start_ts"],
            "p_end_ts": base_payload["p_end_ts"],
            "p_sites": base_payload["p_sites"],
            "p_channels": base_payload["p_channels"],
            "p_zones": base_payload["p_zones"],
            "p_dows": base_payload["p_dows"],
        },
    )
    avg = pd.DataFrame(avg_rows)
    if avg.empty:
        st.info("No hay datos de pasantes/visitantes en el rango seleccionado.")
        return
    avg["hour"] = pd.to_numeric(avg["hour"], errors="coerce").fillna(0).astype(int)
    avg["passers_avg"] = pd.to_numeric(avg["passers_avg"], errors="coerce").fillna(0.0)
    avg["visitors_avg"] = pd.to_numeric(avg["visitors_avg"], errors="coerce").fillna(0.0)
    avg = avg[avg["hour"].between(6, 23)].copy()
    avg["hour_label"] = avg["hour"].apply(_fmt_hour_label)

    long = pd.concat(
        [
            avg[["hour", "passers_avg"]].rename(columns={"passers_avg": "avg_count"}).assign(label="Pasantes (vereda)"),
            avg[["hour", "visitors_avg"]].rename(columns={"visitors_avg": "avg_count"}).assign(label="Visitantes (ingreso)"),
        ],
        ignore_index=True,
    )
    long["hour_label"] = long["hour"].apply(_fmt_hour_label)
    st.markdown("**Promedio por Hora (Lima)**")
    ch_hour = (
        alt.Chart(long)
        .mark_line(point=True, strokeWidth=3)
        .encode(
            x=alt.X("hour_label:N", title="Hora (Lima)", sort=[_fmt_hour_label(h) for h in range(6, 24)]),
            y=alt.Y("avg_count:Q", title="Promedio"),
            color=alt.Color("label:N", title=""),
            tooltip=["hour_label:N", "label:N", alt.Tooltip("avg_count:Q", format=".2f", title="Promedio")],
        )
        .properties(height=280)
    )
    st.altair_chart(ch_hour, use_container_width=True)
