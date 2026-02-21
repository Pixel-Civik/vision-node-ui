import altair as alt
import pandas as pd
import streamlit as st
from ..core.analytics import ts_metric

def _fmt_hour_label(h: int) -> str:
    from datetime import datetime as dt_lib
    return dt_lib(2000, 1, 1, h, 0).strftime("%I %p").lstrip("0")

def render_behavior(f: pd.DataFrame, start_ts, end_ts, metric_mode: str, pal: dict):
    duration_hours = (end_ts - start_ts).total_seconds() / 3600.0
    f_ee = f[f["event_type"].isin(["enter", "exit"])].copy()
    metric = "eventos" if metric_mode == "Eventos" else "personas"
    y_title = "Eventos" if metric == "eventos" else "Personas (tracks únicos)"
    if duration_hours <= 48:
        st.markdown("**1. Evolución Temporal por Hora**")
        evo_base = f_ee.copy()
        bucket_evo = "15min" if duration_hours <= 12 else "1H"
        evo_base["ts_local"] = evo_base["local_date"] + pd.to_timedelta(evo_base["hour"], unit="h")
        evo_tmp = evo_base.copy()
        evo_tmp["ts"] = evo_tmp["ts_local"]
        evo_tmp = evo_tmp.drop(columns=["ts_local"], errors="ignore")
        g_evo = ts_metric(evo_tmp, bucket=bucket_evo, metric=metric)
        if g_evo.empty:
            st.info("No existen datos en el rango seleccionado.")
        else:
            ch_evo = (
                alt.Chart(g_evo)
                .mark_line(point=True, strokeWidth=3)
                .encode(
                    x=alt.X("ts:T", title="Tiempo"),
                    y=alt.Y("count:Q", title=y_title),
                    color=alt.Color("event_type:N", title="", scale=alt.Scale(domain=list(pal.keys()), range=list(pal.values()))),
                    tooltip=[alt.Tooltip("ts:T", title="Tiempo", format="%d %b %H:%M"), "event_type:N", "count:Q"],
                )
                .properties(height=300)
            )
            st.altair_chart(ch_evo, use_container_width=True)
    else:
        st.markdown("**1. Perfil Promedio por Hora (08:00 - 23:00)**")
        ha_base = f_ee.copy()
        if metric == "personas" and "track_id" in ha_base.columns:
            ha_base = ha_base.copy()
            ha_base["date"] = ha_base["local_date"]
            ha_base = ha_base.groupby(["date", "hour", "event_type"], as_index=False)["track_id"].nunique(dropna=True).rename(columns={"track_id": "events_avg"})
            ha = ha_base.groupby(["hour", "event_type"], as_index=False)["events_avg"].mean()
        else:
            a = ha_base.copy()
            a["date"] = a["local_date"]
            a = a.groupby(["date", "hour", "event_type"], as_index=False).size().rename(columns={"size": "events_avg"})
            ha = a.groupby(["hour", "event_type"], as_index=False)["events_avg"].mean()
        ha = ha[(ha["hour"] >= 8) & (ha["hour"] <= 23)].copy()
        if ha.empty:
            st.info("No existen datos en el horario 08:00 - 23:00.")
        else:
            hours = list(range(8, 24))
            hour_labels = [_fmt_hour_label(h) for h in hours]
            event_types = ["enter", "exit"]
            full = pd.DataFrame({"hour": hours}).merge(pd.DataFrame({"event_type": event_types}), how="cross")
            ha = full.merge(ha, on=["hour", "event_type"], how="left")
            ha["events_avg"] = ha["events_avg"].fillna(0)
            ha["hour_label"] = ha["hour"].apply(_fmt_hour_label)
            ch_hora = (
                alt.Chart(ha)
                .mark_line(point=True, strokeWidth=3)
                .encode(
                    x=alt.X(
                        "hour_label:N",
                        title="Hora",
                        sort=hour_labels,
                        axis=alt.Axis(values=hour_labels, labelOverlap=False),
                    ),
                    y=alt.Y("events_avg:Q", title="Promedio de Eventos"),
                    color=alt.Color("event_type:N", title="", scale=alt.Scale(domain=list(pal.keys()), range=list(pal.values()))),
                    tooltip=["hour_label:N", "event_type:N", alt.Tooltip("events_avg:Q", format=".2f", title="Promedio")],
                )
                .properties(height=300)
            )
            st.altair_chart(ch_hora, use_container_width=True)
    st.divider()
    st.markdown("**2. Evolución Diaria**")
    if duration_hours > 48:
        d_base = f_ee.copy()
        d_base["date"] = d_base["local_date"]
        if metric == "personas" and "track_id" in d_base.columns:
            dd = d_base.groupby(["date", "event_type"], as_index=False)["track_id"].nunique(dropna=True).rename(columns={"track_id": "count"})
        else:
            dd = d_base.groupby(["date", "event_type"], as_index=False).size().rename(columns={"size": "count"})
        if dd.empty:
            st.info("Sin datos diarios disponibles.")
        else:
            ch_day = (
                alt.Chart(dd)
                .mark_line(point=True, strokeWidth=3)
                .encode(
                    x=alt.X("date:T", title="Fecha"),
                    y=alt.Y("count:Q", title=y_title),
                    color=alt.Color("event_type:N", title="", scale=alt.Scale(domain=list(pal.keys()), range=list(pal.values()))),
                    tooltip=[alt.Tooltip("date:T", title="Fecha", format="%d %b"), "event_type:N", "count:Q"],
                )
                .properties(height=250)
            )
            st.altair_chart(ch_day, use_container_width=True)
    else:
        st.caption("Seleccionar un rango superior a 48 horas para visualizar evolución diaria.")
    st.divider()
    st.markdown("**3. Promedio por Día de Semana (Circular)**")
    dw = f_ee.copy()
    dw_counts = dw.groupby(["dow", "event_type"], as_index=False).size().rename(columns={"size": "total_count"})
    days_per_dow = dw.groupby("dow")["local_date"].nunique().rename("num_days").reset_index()
    dw_avg = pd.merge(dw_counts, days_per_dow, on="dow", how="left")
    dw_avg["avg_count"] = dw_avg["total_count"] / dw_avg["num_days"]
    dw_avg["dow_name"] = dw_avg["dow"].map({0: "Lunes", 1: "Martes", 2: "Miércoles", 3: "Jueves", 4: "Viernes", 5: "Sábado", 6: "Domingo"})
    dw_avg["dow_name"] = pd.Categorical(dw_avg["dow_name"], categories=["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"], ordered=True)
    dw_pie = dw_avg.groupby("dow_name", as_index=False)["avg_count"].sum()
    total_avg = float(dw_pie["avg_count"].sum() or 1.0)
    dw_pie["pct"] = (dw_pie["avg_count"] / total_avg) * 100.0
    if not dw_pie.empty:
        pie = (
            alt.Chart(dw_pie)
            .mark_arc(innerRadius=70)
            .encode(
                theta=alt.Theta("avg_count:Q"),
                color=alt.Color("dow_name:N", title=""),
                tooltip=["dow_name:N", alt.Tooltip("avg_count:Q", format=".2f", title="Promedio"), alt.Tooltip("pct:Q", format=".1f", title="%")],
            )
            .properties(height=260)
        )
        st.altair_chart(pie, use_container_width=True)
    else:
        st.info("Datos insuficientes para promedio semanal.")
