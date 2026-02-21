import altair as alt
import pandas as pd
import streamlit as st

def render_visitors(f: pd.DataFrame):
    st.subheader("Pasantes")
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
    c1, c2, c3 = st.columns(3)
    with c1:
        st.metric("Total Pasantes", f"{int(len(base))}")
    with c2:
        st.metric("Zonas", f"{int(base['zone_name'].nunique() if 'zone_name' in base.columns else 0)}")
    with c3:
        st.metric("Dispositivos", f"{int(base['channel'].nunique() if 'channel' in base.columns else 0)}")
    if "local_date" in base.columns:
        num_days = int(base["local_date"].nunique())
    else:
        num_days = int(base["ts"].dt.floor("D").nunique())
    st.metric("Promedio Pasantes/Día", f"{round(len(base) / max(1, num_days), 2)}")

    if "hour" in base.columns:
        st.markdown("**Picos por Hora (hora local)**")
        by_hour = base.groupby("hour", as_index=False).size().rename(columns={"size": "count"}).sort_values("hour")
        full = pd.DataFrame({"hour": list(range(24))})
        by_hour = full.merge(by_hour, on="hour", how="left")
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
    if "local_date" in base.columns and "hour" in base.columns:
        s = base.copy()
        s["local_ts"] = s["local_date"] + pd.to_timedelta(s["hour"], unit="h")
        series = s.groupby("local_ts", as_index=False).size().rename(columns={"size": "count"}).sort_values("local_ts")
        x_field = "local_ts:T"
    else:
        b = base.copy()
        b = b[b["ts"].notna()].copy()
        b = b.set_index("ts").sort_index()
        series = b.resample("1H").size().rename("count").reset_index().rename(columns={"ts": "local_ts"})
        x_field = "local_ts:T"
    ch = (
        alt.Chart(series)
        .mark_line(point=True, strokeWidth=3, color="#111827")
        .encode(
            x=alt.X(x_field, title="Tiempo"),
            y=alt.Y("count:Q", title="Pasantes"),
            tooltip=[alt.Tooltip(x_field, title="Tiempo", format="%d %b %H:%M"), "count:Q"],
        )
        .properties(height=220)
    )
    st.altair_chart(ch, use_container_width=True)
    st.markdown("**Pasantes por Zona**")
    if "zone_name" in base.columns:
        z = base.groupby("zone_name", as_index=False).size().rename(columns={"size": "count"})
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
        cam = base.groupby("channel", as_index=False).size().rename(columns={"size": "count"})
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
