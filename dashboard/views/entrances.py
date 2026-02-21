import altair as alt
import pandas as pd
import streamlit as st


def render_entrances(f: pd.DataFrame) -> None:
    st.subheader("Entradas (tienda)")
    base = f.copy()
    if "event_type" not in base.columns:
        st.info("Datos insuficientes.")
        return

    base = base[base["event_type"] == "enter"].copy()
    if base.empty:
        st.info("No hay eventos de entradas (enter) con los filtros seleccionados.")
        return

    zone_col = "zone_name" if "zone_name" in base.columns else None
    zones: list[str] = []
    if zone_col and base[zone_col].notna().any():
        zones = sorted([z for z in base[zone_col].dropna().astype("string").unique().tolist() if str(z).strip()])

    if zones:
        zone_options = ["Todas"] + zones
        zone_sel = st.selectbox("Zona", options=zone_options, index=0, key="enter_zone_sel")
        if zone_sel != "Todas":
            base = base[base[zone_col] == zone_sel].copy()
            if base.empty:
                st.info("Sin datos para la zona seleccionada.")
                return

    if "local_date" in base.columns:
        num_days = int(base["local_date"].nunique())
    else:
        num_days = int(base["ts"].dt.floor("D").nunique())

    total = int(len(base))
    tracks = int(base["track_id"].dropna().nunique()) if "track_id" in base.columns else 0
    devices = int(base["channel"].dropna().nunique()) if "channel" in base.columns else 0
    zones_n = int(base[zone_col].dropna().nunique()) if zone_col else 0
    avg_per_day = round(total / max(1, num_days), 2)

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Total Entradas", f"{total}")
    c2.metric("Promedio Entradas/Día", f"{avg_per_day}")
    c3.metric("Identificadores Únicos", f"{tracks}")
    c4.metric("Dispositivos / Zonas", f"{devices} / {zones_n}")

    if "hour" in base.columns:
        by_hour = base.groupby("hour", as_index=False).size().rename(columns={"size": "count"}).sort_values("hour")
        full = pd.DataFrame({"hour": list(range(24))})
        by_hour = full.merge(by_hour, on="hour", how="left")
        by_hour["count"] = by_hour["count"].fillna(0).astype(int)
        peak_row = by_hour.sort_values(["count", "hour"], ascending=[False, True]).head(1)
        if not peak_row.empty:
            peak_hour = int(peak_row["hour"].iloc[0])
            peak_count = int(peak_row["count"].iloc[0])
            st.caption(f"Pico horario (Lima): {peak_hour:02d}:00 con {peak_count} entradas.")

        ch_hour = (
            alt.Chart(by_hour)
            .mark_bar(color="#10B981")
            .encode(
                x=alt.X("hour:O", title="Hora (Lima)"),
                y=alt.Y("count:Q", title="Entradas"),
                tooltip=["hour:O", "count:Q"],
            )
            .properties(height=220)
        )
        st.altair_chart(ch_hour, use_container_width=True)

    if "local_date" in base.columns and "hour" in base.columns:
        s = base.copy()
        s["local_ts"] = s["local_date"] + pd.to_timedelta(s["hour"], unit="h")
        series = s.groupby("local_ts", as_index=False).size().rename(columns={"size": "count"}).sort_values("local_ts")
        ch_series = (
            alt.Chart(series)
            .mark_line(point=True, strokeWidth=3, color="#111827")
            .encode(
                x=alt.X("local_ts:T", title="Tiempo"),
                y=alt.Y("count:Q", title="Entradas"),
                tooltip=[alt.Tooltip("local_ts:T", title="Tiempo", format="%d %b %H:%M"), "count:Q"],
            )
            .properties(height=240)
        )
        st.altair_chart(ch_series, use_container_width=True)

    if zone_col and zones:
        st.markdown("**Entradas por Zona (top)**")
        z = base.groupby(zone_col, as_index=False).size().rename(columns={"size": "count"}).sort_values("count", ascending=False).head(15)
        ch_zone = (
            alt.Chart(z)
            .mark_bar(color="#059669")
            .encode(
                y=alt.Y(f"{zone_col}:N", sort="-x", title="Zona"),
                x=alt.X("count:Q", title="Entradas"),
                tooltip=[f"{zone_col}:N", "count:Q"],
            )
            .properties(height=300)
        )
        st.altair_chart(ch_zone, use_container_width=True)
