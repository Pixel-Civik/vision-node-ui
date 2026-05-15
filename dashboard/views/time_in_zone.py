import altair as alt
import numpy as np
import pandas as pd
import streamlit as st


def render_time_in_zone(f: pd.DataFrame, ctx: dict):
    st.subheader("Tiempo en Zona")
    st.caption(
        "Analiza cuánto tiempo permanecen las personas en una zona específica (evento `visit`/`time_in_zone`). "
        "Útil para medir tiempos de espera en colas, permanencia en áreas de exhibición o zonas de atención. "
        "Selecciona la zona en el desplegable para filtrar el análisis."
    )
    base = f.copy()
    if "event_type" not in base.columns:
        st.info("Datos insuficientes.")
        return
    base = base[base["event_type"] == "visit"].copy()
    if base.empty:
        st.info("No hay eventos de tiempo en zona (visit) en el rango seleccionado.")
        return

    if "duration_s" in base.columns:
        base["duration_s"] = pd.to_numeric(base["duration_s"], errors="coerce")
    elif "dwell_sec" in base.columns:
        base["duration_s"] = pd.to_numeric(base["dwell_sec"], errors="coerce")
    else:
        base["duration_s"] = pd.NA

    base = base[base["duration_s"].notna()].copy()
    if base.empty:
        st.info("No hay duración válida (dwell_sec) para tiempo en zona.")
        return

    base["duration_s"] = base["duration_s"].astype("float64")
    base["duration_min"] = base["duration_s"] / 60.0
    zone_col = "zone_name" if "zone_name" in base.columns else "zone"
    all_visits = base.copy()

    if zone_col in base.columns:
        zones = sorted([z for z in base[zone_col].dropna().astype("string").unique().tolist() if str(z).strip()])
        if zones:
            default_zone = "queue" if "queue" in zones else zones[0]
            zone_sel = st.selectbox("Zona", options=zones, index=zones.index(default_zone))
            base = base[base[zone_col] == zone_sel].copy()
            if base.empty:
                st.info("Sin datos para la zona seleccionada.")
                return
    else:
        zone_sel = ""

    # ── KPIs desde pandas ────────────────────────────────────────────────────
    n        = len(base)
    avg_s    = float(base["duration_s"].mean() or 0)
    median_s = float(base["duration_s"].median() or 0)
    p90_s    = float(np.percentile(base["duration_s"].dropna(), 90)) if n > 0 else 0.0
    days     = int(base["local_date"].nunique()) if "local_date" in base.columns else 1

    c1, c2, c3, c4 = st.columns(4)
    c1.metric(
        "Registros",
        f"{n:,}",
        help="Total de eventos de permanencia en la zona seleccionada dentro del período.",
    )
    c2.metric(
        "Mediana de permanencia",
        f"{median_s:.1f}s",
        f"{median_s/60:.2f} min",
        delta_color="off",
        help=(
            "Tiempo de permanencia del visitante 'típico': la mitad estuvo menos de este tiempo "
            "y la otra mitad más. Es más robusta que el promedio porque no se ve afectada por "
            "valores extremos (ej. alguien que estuvo 2 horas)."
        ),
    )
    c3.metric(
        "Promedio de permanencia",
        f"{avg_s:.1f}s",
        f"{avg_s/60:.2f} min",
        delta_color="off",
        help=(
            "Tiempo promedio de permanencia en la zona. Puede ser mayor que la mediana si hay "
            "pocos visitantes con tiempos muy altos que 'jalan' el promedio hacia arriba."
        ),
    )
    c4.metric(
        "P90 de permanencia",
        f"{p90_s:.1f}s",
        f"{p90_s/60:.2f} min",
        delta_color="off",
        help=(
            "Percentil 90: el 90% de los visitantes estuvo menos de este tiempo en la zona. "
            "Útil para dimensionar el peor caso frecuente (sin contar el 10% más extremo)."
        ),
    )
    st.metric(
        "Visitas/día (prom.)",
        f"{round(n / max(1, days), 1)}",
        help=f"Promedio de eventos de permanencia por día. Total {n:,} registros en {days} día(s).",
    )

    # ── SLA buckets + histograma ──────────────────────────────────────────────
    def _sla_bucket(v: float) -> str:
        if v < 15:   return "<15s"
        if v < 30:   return "15-30s"
        if v < 60:   return "30-60s"
        if v < 120:  return "1-2m"
        if v < 300:  return "2-5m"
        return "5m+"

    order = ["<15s", "15-30s", "30-60s", "1-2m", "2-5m", "5m+"]
    v1, v2 = st.columns([1, 1])
    with v1:
        st.markdown("**SLA de Colas (distribución)**")
        sla = base.copy()
        sla["bucket"] = sla["duration_s"].apply(_sla_bucket)
        sla_agg = sla.groupby("bucket", as_index=False).size().rename(columns={"size": "count"})
        total = float(sla_agg["count"].sum() or 1)
        sla_agg["pct"] = (sla_agg["count"] / total) * 100.0
        sla_agg["bucket"] = pd.Categorical(sla_agg["bucket"], categories=order, ordered=True)
        pie = (
            alt.Chart(sla_agg)
            .mark_arc(innerRadius=70)
            .encode(
                theta=alt.Theta("count:Q"),
                color=alt.Color("bucket:N", title="", sort=order),
                tooltip=["bucket:N", "count:Q", alt.Tooltip("pct:Q", format=".1f", title="%")],
            )
            .properties(height=260)
        )
        st.altair_chart(pie, use_container_width=True)
    with v2:
        st.markdown("**Distribución (histograma)**")
        hist = (
            alt.Chart(base)
            .mark_bar(color="#10B981")
            .encode(
                x=alt.X("duration_s:Q", bin=alt.Bin(maxbins=30), title="Duración (s)"),
                y=alt.Y("count():Q", title="Frecuencia"),
                tooltip=[alt.Tooltip("count():Q", title="Frecuencia")],
            )
            .properties(height=260)
        )
        st.altair_chart(hist, use_container_width=True)

    # ── Picos por hora ────────────────────────────────────────────────────────
    if "hour" in base.columns:
        st.markdown("**Picos por Hora (hora local)**")
        by_hour = (
            base.groupby("hour", as_index=False)
            .agg(count=("duration_s", "size"), avg_s=("duration_s", "mean"))
        )
        bar_h = (
            alt.Chart(by_hour)
            .mark_bar(opacity=0.25, color="#2563EB")
            .encode(
                x=alt.X("hour:O", title="Hora (Lima)"),
                y=alt.Y("count:Q", title="Visitas"),
                tooltip=["hour:O", alt.Tooltip("count:Q", title="Visitas")],
            )
        )
        line_h = (
            alt.Chart(by_hour)
            .mark_line(point=True, color="#111827", strokeWidth=3)
            .encode(
                x=alt.X("hour:O", title=""),
                y=alt.Y("avg_s:Q", title="Promedio (s)"),
                tooltip=["hour:O", alt.Tooltip("avg_s:Q", format=".1f", title="Promedio (s)")],
            )
        )
        st.altair_chart(
            alt.layer(bar_h, line_h).resolve_scale(y="independent").properties(height=240),
            use_container_width=True,
        )

    # ── Evolución por hora (resample) ─────────────────────────────────────────
    st.markdown("**Evolución por Hora (volumen vs tiempo promedio)**")
    s = base[base["ts"].notna()].copy().set_index("ts").sort_index()
    if not s.empty:
        tmp = s["duration_s"].resample("1h").agg(["size", "mean"]).reset_index()
        tmp = tmp.rename(columns={"size": "count", "mean": "avg_duration_s"})
        bar = (
            alt.Chart(tmp)
            .mark_bar(opacity=0.22, color="#2563EB")
            .encode(
                x=alt.X("ts:T", title="Tiempo"),
                y=alt.Y("count:Q", title="Visitas"),
                tooltip=[alt.Tooltip("ts:T", title="Tiempo", format="%d %b %H:%M"), alt.Tooltip("count:Q", title="Visitas")],
            )
        )
        line = (
            alt.Chart(tmp)
            .mark_line(point=True, color="#111827", strokeWidth=3)
            .encode(
                x=alt.X("ts:T", title=""),
                y=alt.Y("avg_duration_s:Q", title="Promedio (s)"),
                tooltip=[alt.Tooltip("ts:T", title="Tiempo", format="%d %b %H:%M"), alt.Tooltip("avg_duration_s:Q", format=".1f", title="Promedio (s)")],
            )
        )
        st.altair_chart(
            alt.layer(bar, line).resolve_scale(y="independent").properties(height=260),
            use_container_width=True,
        )

    # ── Tendencia diaria ──────────────────────────────────────────────────────
    if "local_date" in base.columns:
        st.markdown("**Tendencia Diaria (visitas vs tiempo promedio)**")
        by_day = (
            base.groupby("local_date", as_index=False)
            .agg(count=("duration_s", "size"), avg_s=("duration_s", "mean"))
        )
        bar_d = (
            alt.Chart(by_day)
            .mark_bar(opacity=0.22, color="#2563EB")
            .encode(
                x=alt.X("local_date:T", title="Fecha"),
                y=alt.Y("count:Q", title="Visitas"),
                tooltip=[alt.Tooltip("local_date:T", title="Fecha", format="%d %b"), alt.Tooltip("count:Q", title="Visitas")],
            )
        )
        line_d = (
            alt.Chart(by_day)
            .mark_line(point=True, color="#111827", strokeWidth=3)
            .encode(
                x=alt.X("local_date:T", title=""),
                y=alt.Y("avg_s:Q", title="Promedio (s)"),
                tooltip=[alt.Tooltip("local_date:T", title="Fecha", format="%d %b"), alt.Tooltip("avg_s:Q", format=".1f", title="Promedio (s)")],
            )
        )
        st.altair_chart(
            alt.layer(bar_d, line_d).resolve_scale(y="independent").properties(height=240),
            use_container_width=True,
        )

    # ── Mapa de calor hora × día ──────────────────────────────────────────────
    if "hour" in base.columns and "dow" in base.columns:
        st.markdown("**Mapa de Calor (hora vs día): duración promedio**")
        hm = (
            base.groupby(["dow", "hour"], as_index=False)
            .agg(avg_duration_s=("duration_s", "mean"), count=("duration_s", "size"))
        )
        dow_names = {0: "Lunes", 1: "Martes", 2: "Miércoles", 3: "Jueves", 4: "Viernes", 5: "Sábado", 6: "Domingo"}
        hm["dow_name"] = hm["dow"].map(dow_names)
        hm["dow_name"] = pd.Categorical(hm["dow_name"], categories=list(dow_names.values()), ordered=True)
        heat = (
            alt.Chart(hm)
            .mark_rect(cornerRadius=4)
            .encode(
                x=alt.X("hour:O", title="Hora (Lima)"),
                y=alt.Y("dow_name:N", title=""),
                color=alt.Color("avg_duration_s:Q", title="Promedio (s)", scale=alt.Scale(scheme="greens")),
                tooltip=["dow_name:N", "hour:O", alt.Tooltip("avg_duration_s:Q", format=".1f", title="Promedio (s)"), alt.Tooltip("count:Q", title="Visitas")],
            )
            .properties(height=260)
        )
        st.altair_chart(heat, use_container_width=True)

    # ── Top zonas ─────────────────────────────────────────────────────────────
    if zone_col in all_visits.columns and all_visits[zone_col].notna().any():
        st.markdown("**Top Zonas por Tiempo (mediana y P90)**")
        def _zone_stats(grp):
            d = grp["duration_s"].dropna()
            return pd.Series({
                "count":    len(d),
                "median":   float(d.median()) if len(d) else 0.0,
                "p90":      float(np.percentile(d, 90)) if len(d) else 0.0,
            })
        stats = all_visits.groupby(zone_col).apply(_zone_stats).reset_index()
        stats = stats.sort_values("median", ascending=False).head(12)
        bars = (
            alt.Chart(stats)
            .mark_bar(color="#7C3AED")
            .encode(
                y=alt.Y(f"{zone_col}:N", sort="-x", title="Zona"),
                x=alt.X("median:Q", title="Mediana (s)"),
                tooltip=[f"{zone_col}:N", "count:Q", alt.Tooltip("median:Q", format=".1f", title="Mediana (s)"), alt.Tooltip("p90:Q", format=".1f", title="P90 (s)")],
            )
            .properties(height=260)
        )
        st.altair_chart(bars, use_container_width=True)

    # ── Tabla de auditoría ────────────────────────────────────────────────────
    st.markdown("**Muestra de eventos (para auditoría)**")
    show_cols = [c for c in ["site", "channel", "camera_name", zone_col, "ts", "duration_s", "track_id", "time_enter", "time_end", "dwell_sec"] if c in base.columns]
    sample = base.sort_values("ts").tail(30)[show_cols] if show_cols else base.sort_values("ts").tail(30)
    st.dataframe(sample, use_container_width=True, hide_index=True)
