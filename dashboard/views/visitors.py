import altair as alt
import pandas as pd
import streamlit as st
from ..data import supabase_rpc

def render_visitors(f: pd.DataFrame, ctx: dict):
    st.subheader("Pasantes")
    st.caption(
        "Muestra los eventos de **tráfico peatonal** en la vereda (tipo `pasante`): "
        "personas que caminaron frente al local sin necesariamente haber entrado. "
        "Se usa para calcular la tasa de conversión: qué porcentaje del flujo externo ingresó al local."
    )
    base = f.copy()
    if "event_type" not in base.columns:
        st.info("Datos insuficientes.")
        return
    base = base[base["event_type"] == "pasante"].copy()
    if base.empty:
        st.info("No hay eventos de pasantes en el rango seleccionado.")
        return
    zone_col = "zone_name" if "zone_name" in base.columns else None
    zones: list[str] = []
    if zone_col and base[zone_col].notna().any():
        zones = sorted([z for z in base[zone_col].dropna().astype("string").unique().tolist() if str(z).strip()])
    if zones:
        zone_options = ["Todas"] + zones
        zone_sel = st.selectbox("Zona", options=zone_options, index=0, key="pasante_zone_sel")
        if zone_sel != "Todas":
            base = base[base[zone_col] == zone_sel].copy()
            if base.empty:
                st.info("Sin datos para la zona seleccionada.")
                return

    sb_url = str(ctx.get("sb_url") or "").strip()
    sb_key = str(ctx.get("sb_key") or "").strip()
    if not sb_url or not sb_key:
        st.warning("Faltan credenciales de Supabase en el .env.")
        return

    p_zones = None
    if zone_col and zones and zone_sel != "Todas":
        p_zones = [str(zone_sel)]

    payload = {
        "p_start_ts": ctx["start_ts"].isoformat(),
        "p_end_ts": ctx["end_ts"].isoformat(),
        "p_sites": ctx.get("sel_sites"),
        "p_channels": ctx.get("sel_channels"),
        "p_zones": p_zones,
        "p_events": ["pasante"],
        "p_hour_min": None,
        "p_hour_max": None,
        "p_dows": ctx.get("dow_sel"),
    }

    kpi_rows = supabase_rpc(sb_url, sb_key, "dashboard_kpi", payload)
    kpi = kpi_rows[0] if kpi_rows else {}
    total = int(kpi.get("total") or 0)
    num_days = int(kpi.get("days") or 1)
    avg_per_day = float(kpi.get("avg_per_day") or 0)
    zones_n = int(base["zone_name"].nunique() if "zone_name" in base.columns else 0)
    devices = int(base["channel"].nunique() if "channel" in base.columns else 0)

    c1, c2, c3 = st.columns(3)
    with c1:
        st.metric("Total Pasantes", f"{total}")
    with c2:
        st.metric("Zonas", f"{zones_n}")
    with c3:
        st.metric("Dispositivos", f"{devices}")
    st.metric("Promedio Pasantes/Día", f"{round(total / max(1, num_days), 2)}")

    st.markdown("**Picos por Hora (hora local)**")
    by_hour_rows = supabase_rpc(sb_url, sb_key, "dashboard_hourly_totals", payload)
    by_hour = pd.DataFrame(by_hour_rows)
    if not by_hour.empty:
        by_hour = by_hour[by_hour["event_type"] == "pasante"].copy()
        by_hour["hour"] = pd.to_numeric(by_hour["hour"], errors="coerce").fillna(0).astype(int)
        by_hour["count"] = pd.to_numeric(by_hour["count"], errors="coerce").fillna(0).astype(int)
        full = pd.DataFrame({"hour": list(range(24))})
        by_hour = full.merge(by_hour[["hour", "count"]], on="hour", how="left")
        by_hour["count"] = by_hour["count"].fillna(0).astype(int)
        peak_row = by_hour.sort_values(["count", "hour"], ascending=[False, True]).head(1)
        if not peak_row.empty:
            peak_hour = int(peak_row["hour"].iloc[0])
            peak_count = int(peak_row["count"].iloc[0])
            st.caption(f"Pico horario (Lima): {peak_hour:02d}:00 con {peak_count} pasantes.")
        ch_hour = (
            alt.Chart(by_hour)
            .mark_bar(color="#6B7280")
            .encode(
                x=alt.X("hour:O", title="Hora (Lima)"),
                y=alt.Y("count:Q", title="Pasantes"),
                tooltip=["hour:O", "count:Q"],
            )
            .properties(height=220)
        )
        st.altair_chart(ch_hour, use_container_width=True)

    st.markdown("**Pasantes por Hora (serie)**")
    series_rows = supabase_rpc(sb_url, sb_key, "dashboard_timeseries_hourly", payload)
    series = pd.DataFrame(series_rows)
    if series.empty:
        return
    series = series[series["event_type"] == "pasante"].copy()
    series["count"] = pd.to_numeric(series["count"], errors="coerce").fillna(0).astype(int)
    ch = (
        alt.Chart(series)
        .mark_line(point=True, strokeWidth=3, color="#111827")
        .encode(
            x=alt.X("local_ts_hour:T", title="Tiempo"),
            y=alt.Y("count:Q", title="Pasantes"),
            tooltip=[alt.Tooltip("local_ts_hour:T", title="Tiempo", format="%d %b %H:%M"), "count:Q"],
        )
        .properties(height=220)
    )
    st.altair_chart(ch, use_container_width=True)
    st.markdown("**Pasantes por Zona**")
    if "zone_name" in base.columns:
        z_rows = supabase_rpc(sb_url, sb_key, "dashboard_breakdown_zone", payload)
        z = pd.DataFrame(z_rows)
        if z.empty:
            return
        z = z[z["event_type"] == "pasante"].copy()
        z = z.rename(columns={"zone": "zone_name"})
        z["count"] = pd.to_numeric(z["count"], errors="coerce").fillna(0).astype(int)
        cz = (
            alt.Chart(z)
            .mark_bar(color="#111827")
            .encode(
                y=alt.Y("zone_name:N", sort="-x", title="Zona"),
                x=alt.X("count:Q", title="Pasantes"),
                tooltip=["zone_name:N", "count:Q"],
            )
            .properties(height=260)
        )
        st.altair_chart(cz, use_container_width=True)
    st.markdown("**Pasantes por Dispositivo**")
    if "channel" in base.columns:
        cam_rows = supabase_rpc(sb_url, sb_key, "dashboard_breakdown_channel", payload)
        cam = pd.DataFrame(cam_rows)
        if cam.empty:
            return
        cam = cam[cam["event_type"] == "pasante"].copy()
        cam["count"] = pd.to_numeric(cam["count"], errors="coerce").fillna(0).astype(int)
        cc = (
            alt.Chart(cam)
            .mark_bar(color="#2563EB")
            .encode(
                y=alt.Y("channel:N", sort="-x", title="Dispositivo"),
                x=alt.X("count:Q", title="Pasantes"),
                tooltip=["channel:N", "count:Q"],
            )
            .properties(height=220)
        )
        st.altair_chart(cc, use_container_width=True)
