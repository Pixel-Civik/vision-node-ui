import altair as alt
import pandas as pd
import streamlit as st
from ..core.analytics import ts_metric
from ..data import supabase_rpc
import os

def _fmt_hour_label(h: int) -> str:
    from datetime import datetime as dt_lib
    return dt_lib(2000, 1, 1, h, 0).strftime("%I %p").lstrip("0")

def render_behavior(f: pd.DataFrame, start_ts, end_ts, metric_mode: str, pal: dict):
    duration_hours = (end_ts - start_ts).total_seconds() / 3600.0
    f_ee = f[f["event_type"].isin(["enter", "exit"])].copy()
    metric = "eventos" if metric_mode == "Eventos" else "personas"
    y_title = "Eventos" if metric == "eventos" else "Personas (tracks únicos)"
    if duration_hours <= 48:
        st.markdown("**1. Conteo por Hora (exacto)**")
        if metric != "eventos":
            st.caption("El conteo exacto por hora desde Supabase aplica a la métrica Eventos.")
        site_vals = [str(x) for x in f_ee["site"].dropna().unique().tolist()] if "site" in f_ee.columns else []
        site_name = site_vals[0] if len(site_vals) == 1 else None
        if not site_name or f_ee.empty or metric != "eventos":
            st.info("Selecciona una única ubicación y métrica Eventos para ver el conteo exacto por hora.")
        else:
            start_date = pd.to_datetime(f_ee["local_date"]).min().date()
            end_date = pd.to_datetime(f_ee["local_date"]).max().date()
            sb_url = os.getenv("SUPABASE_URL", "")
            sb_key = os.getenv("SUPABASE_ANON_KEY", "") or os.getenv("SUPABASE_KEY", "")
            try:
                rows = supabase_rpc(
                    sb_url,
                    sb_key,
                    "traffic_hourly_enter_exit",
                    {"p_site": site_name, "p_start_date": str(start_date), "p_end_date": str(end_date)},
                )
                h = pd.DataFrame(rows)
                if h.empty:
                    st.info("No existen datos en el rango seleccionado.")
                else:
                    h["hour"] = pd.to_numeric(h["hour"], errors="coerce")
                    h = h[h["hour"].notna()].copy()
                    h["hour"] = h["hour"].astype(int)
                    h = h[h["hour"].between(7, 23)].copy()
                    h = h.groupby(["hour", "event_type"], as_index=False)["count"].sum()
                    hours = list(range(7, 24))
                    hour_labels = [_fmt_hour_label(x) for x in hours]
                    full = pd.DataFrame({"hour": hours}).merge(pd.DataFrame({"event_type": ["enter", "exit"]}), how="cross")
                    h = full.merge(h, on=["hour", "event_type"], how="left")
                    h["count"] = pd.to_numeric(h["count"], errors="coerce").fillna(0).astype(int)
                    h["hour_label"] = h["hour"].apply(_fmt_hour_label)
                    ch = (
                        alt.Chart(h)
                        .mark_line(point=True, strokeWidth=3)
                        .encode(
                            x=alt.X("hour_label:N", title="Hora", sort=hour_labels, axis=alt.Axis(values=hour_labels, labelOverlap=False)),
                            y=alt.Y("count:Q", title=y_title),
                            color=alt.Color("event_type:N", title="", scale=alt.Scale(domain=list(pal.keys()), range=list(pal.values()))),
                            tooltip=["hour_label:N", "event_type:N", "count:Q"],
                        )
                        .properties(height=300)
                    )
                    st.altair_chart(ch, use_container_width=True)
                    if start_date == end_date:
                        rows2 = supabase_rpc(sb_url, sb_key, "traffic_hourly_cumulative_enter_exit", {"p_site": site_name, "p_day": str(start_date)})
                        cdf = pd.DataFrame(rows2)
                        if not cdf.empty:
                            cdf["hour"] = pd.to_numeric(cdf["hour"], errors="coerce")
                            cdf = cdf[cdf["hour"].notna()].copy()
                            cdf["hour"] = cdf["hour"].astype(int)
                            cdf = cdf[cdf["hour"].between(7, 23)].copy()
                            cdf["hour_label"] = cdf["hour"].apply(_fmt_hour_label)
                            cch = (
                                alt.Chart(cdf)
                                .mark_line(point=True, strokeWidth=3)
                                .encode(
                                    x=alt.X("hour_label:N", title="Hora", sort=hour_labels),
                                    y=alt.Y("net_cum:Q", title="Neto acumulado"),
                                    tooltip=["hour_label:N", "net_cum:Q"],
                                )
                                .properties(height=180)
                            )
                            st.altair_chart(cch, use_container_width=True)
            except Exception as e:
                st.error(f"Error Supabase RPC: {e}")
    else:
        st.markdown("**1. Perfil Promedio por Hora (07:00 - 23:00)**")
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
        ha = ha[(ha["hour"] >= 7) & (ha["hour"] <= 23)].copy()
        if ha.empty:
            st.info("No existen datos en el horario 07:00 - 23:00.")
        else:
            hours = list(range(7, 24))
            hour_labels = [_fmt_hour_label(h) for h in hours]
            event_types = ["enter", "exit"]
            full = pd.DataFrame({"hour": hours}).merge(pd.DataFrame({"event_type": event_types}), how="cross")
            ha = full.merge(ha, on=["hour", "event_type"], how="left")
            ha["events_avg"] = ha["events_avg"].fillna(0)
            ha["hour_label"] = ha["hour"].apply(_fmt_hour_label)
            ch_hora_base = alt.Chart(ha).encode(
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
            ch_line = ch_hora_base.mark_line(point=True, strokeWidth=3)
            ch_text = ch_hora_base.mark_text(align="center", dy=-10).encode(text=alt.Text("events_avg:Q", format=".0f"))
            st.altair_chart((ch_line + ch_text).properties(height=300), use_container_width=True)
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
