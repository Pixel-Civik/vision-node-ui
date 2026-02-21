import altair as alt
import pandas as pd
import streamlit as st

def render_time_in_zone(f: pd.DataFrame):
    st.subheader("Tiempo en Zona")
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
    zone_col = "zone_name" if "zone_name" in base.columns else "zone"
    base["duration_s"] = pd.to_numeric(base["duration_s"], errors="coerce")
    base = base[base["duration_s"].notna()].copy()
    base["duration_s"] = base["duration_s"].astype("float64")
    base["duration_min"] = base["duration_s"] / 60.0
    if zone_col in base.columns:
        all_visits = base.copy()
        zones = sorted([z for z in base[zone_col].dropna().astype("string").unique().tolist() if str(z).strip()])
        if zones:
            default_zone = "queue" if "queue" in zones else zones[0]
            zone_sel = st.selectbox("Zona", options=zones, index=zones.index(default_zone))
            base = base[base[zone_col] == zone_sel].copy()
            if base.empty:
                st.info("Sin datos para la zona seleccionada.")
                return
    else:
        all_visits = base.copy()
        zone_sel = ""
    c1, c2, c3, c4 = st.columns(4)
    d = base["duration_s"]
    c1.metric("Registros", f"{int(len(base))}")
    c2.metric("Mediana", f"{float(d.median()):.1f}s ({float((d.median()/60.0)):.2f}m)")
    c3.metric("Promedio", f"{float(d.mean()):.1f}s ({float((d.mean()/60.0)):.2f}m)")
    c4.metric("P90", f"{float(d.quantile(0.90)):.1f}s ({float((d.quantile(0.90)/60.0)):.2f}m)")

    if "local_date" in base.columns:
        num_days = int(base["local_date"].nunique())
    else:
        num_days = int(base["ts"].dt.floor("D").nunique())
    st.metric("Promedio Visitas/Día", f"{round(len(base) / max(1, num_days), 2)}")

    def _sla_bucket(v: float) -> str:
        if v < 15:
            return "<15s"
        if v < 30:
            return "15-30s"
        if v < 60:
            return "30-60s"
        if v < 120:
            return "1-2m"
        if v < 300:
            return "2-5m"
        return "5m+"

    v1, v2 = st.columns([1, 1])
    with v1:
        st.markdown("**SLA de Colas (distribución)**")
        sla = base.copy()
        sla["bucket"] = sla["duration_s"].apply(_sla_bucket)
        order = ["<15s", "15-30s", "30-60s", "1-2m", "2-5m", "5m+"]
        sla = sla.groupby("bucket", as_index=False).size().rename(columns={"size": "count"})
        total = float(sla["count"].sum() or 1.0)
        sla["pct"] = (sla["count"] / total) * 100.0
        sla["bucket"] = pd.Categorical(sla["bucket"], categories=order, ordered=True)
        pie = (
            alt.Chart(sla)
            .mark_arc(innerRadius=70)
            .encode(
                theta=alt.Theta("count:Q"),
                color=alt.Color("bucket:N", title=""),
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

    st.markdown("**Picos por Hora (hora local)**")
    if "hour" in base.columns:
        by_hour = (
            base.groupby("hour", as_index=False)
            .agg(count=("duration_s", "size"), avg_duration_s=("duration_s", "mean"))
            .sort_values("hour")
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
                y=alt.Y("avg_duration_s:Q", title="Promedio (s)"),
                tooltip=["hour:O", alt.Tooltip("avg_duration_s:Q", format=".1f", title="Promedio (s)")],
            )
        )
        st.altair_chart(alt.layer(bar_h, line_h).resolve_scale(y="independent").properties(height=240), use_container_width=True)

    st.markdown("**Evolución por Hora (volumen vs tiempo promedio)**")
    if "local_date" in base.columns and "hour" in base.columns:
        byh_base = base.copy()
        byh_base["local_ts"] = byh_base["local_date"] + pd.to_timedelta(byh_base["hour"], unit="h")
        byh = (
            byh_base.groupby("local_ts", as_index=False)
            .agg(count=("duration_s", "size"), avg_duration_s=("duration_s", "mean"))
            .sort_values("local_ts")
        )
        x_field = "local_ts:T"
    else:
        s = base.copy()
        s = s[s["ts"].notna()].copy()
        s = s.set_index("ts").sort_index()
        tmp = s["duration_s"].resample("1H").agg(["size", "mean"]).reset_index()
        tmp = tmp.rename(columns={"size": "count", "mean": "avg_duration_s"})
        byh = tmp
        x_field = "ts:T"

    bar = (
        alt.Chart(byh)
        .mark_bar(opacity=0.22, color="#2563EB")
        .encode(
            x=alt.X(x_field, title="Tiempo"),
            y=alt.Y("count:Q", title="Visitas"),
            tooltip=[alt.Tooltip(x_field, title="Tiempo", format="%d %b %H:%M"), alt.Tooltip("count:Q", title="Visitas")],
        )
    )
    line = (
        alt.Chart(byh)
        .mark_line(point=True, color="#111827", strokeWidth=3)
        .encode(
            x=alt.X(x_field, title=""),
            y=alt.Y("avg_duration_s:Q", title="Promedio (s)"),
            tooltip=[alt.Tooltip(x_field, title="Tiempo", format="%d %b %H:%M"), alt.Tooltip("avg_duration_s:Q", format=".1f", title="Promedio (s)")],
        )
    )
    st.altair_chart(alt.layer(bar, line).resolve_scale(y="independent").properties(height=260), use_container_width=True)

    st.markdown("**Tendencia Diaria (visitas vs tiempo promedio)**")
    if "local_date" in base.columns:
        by_day = (
            base.groupby("local_date", as_index=False)
            .agg(count=("duration_s", "size"), avg_duration_s=("duration_s", "mean"))
            .sort_values("local_date")
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
                y=alt.Y("avg_duration_s:Q", title="Promedio (s)"),
                tooltip=[alt.Tooltip("local_date:T", title="Fecha", format="%d %b"), alt.Tooltip("avg_duration_s:Q", format=".1f", title="Promedio (s)")],
            )
        )
        st.altair_chart(alt.layer(bar_d, line_d).resolve_scale(y="independent").properties(height=240), use_container_width=True)

    st.markdown("**Mapa de Calor (hora vs día): duración promedio**")
    if "hour" in base.columns and "dow" in base.columns:
        hm = (
            base.groupby(["dow", "hour"], as_index=False)
            .agg(avg_duration_s=("duration_s", "mean"), count=("duration_s", "size"))
        )
        hm["dow_name"] = hm["dow"].map({0: "Lunes", 1: "Martes", 2: "Miércoles", 3: "Jueves", 4: "Viernes", 5: "Sábado", 6: "Domingo"})
        hm["dow_name"] = pd.Categorical(hm["dow_name"], categories=["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"], ordered=True)
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

    if zone_col in all_visits.columns and all_visits[zone_col].notna().any():
        st.markdown("**Top Zonas por Tiempo (mediana y P90)**")
        z = all_visits.copy()
        z = z[z[zone_col].notna()].copy()
        stats = (
            z.groupby(zone_col, as_index=False)["duration_s"]
            .agg(count="size", median="median", p90=lambda s: float(s.quantile(0.90)))
            .sort_values(["median", "count"], ascending=[False, False])
            .head(12)
        )
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

    st.markdown("**Muestra de eventos (para auditoría)**")
    cols = [c for c in ["site", "channel", zone_col, "ts", "duration_s", "track_id", "time_start", "time_end", "dwell_sec"] if c in base.columns]
    sample = base.sort_values("ts").tail(30)[cols] if cols else base.sort_values("ts").tail(30)
    st.dataframe(sample, use_container_width=True, hide_index=True)
