from __future__ import annotations

import altair as alt
import pandas as pd
import streamlit as st


def _date_range(df: pd.DataFrame) -> tuple[pd.Timestamp, pd.Timestamp]:
    s = df["ts"].dropna()
    if s.empty:
        now = pd.Timestamp.utcnow().tz_localize("UTC")
        return now, now
    return s.min(), s.max()


def _bucket_age(v) -> str:
    try:
        a = float(v)
    except Exception:
        return "N/A"
    if a < 0:
        return "N/A"
    if a < 18:
        return "0-17"
    if a < 25:
        return "18-24"
    if a < 35:
        return "25-34"
    if a < 45:
        return "35-44"
    if a < 55:
        return "45-54"
    if a < 65:
        return "55-64"
    return "65+"


def render_dashboard(df_raw: pd.DataFrame, source_name: str) -> None:
    df = df_raw.copy()
    df = df[df["ts"].notna()].copy()
    df["site"] = df["site"].astype("string")
    df["channel"] = df["channel"].astype("string")
    df["zone_name"] = df["zone_name"].astype("string")
    df["event_type"] = df["event_type"].astype("string")

    min_ts, max_ts = _date_range(df)
    min_d = min_ts.date()
    max_d = max_ts.date()

    sites = sorted([s for s in df["site"].dropna().unique().tolist() if str(s).strip()])
    channels = sorted([c for c in df["channel"].dropna().unique().tolist() if str(c).strip()])
    zones = sorted([z for z in df["zone_name"].dropna().unique().tolist() if str(z).strip()])
    events = sorted([e for e in df["event_type"].dropna().unique().tolist() if str(e).strip()])

    with st.sidebar:
        st.subheader("Filtros")
        date_start, date_end = st.date_input("Rango de fechas", value=(min_d, max_d), min_value=min_d, max_value=max_d)
        sel_sites = st.multiselect("Sitio", options=sites, default=sites[:1] if len(sites) >= 1 else sites)
        sel_channels = st.multiselect("Cámara", options=channels, default=channels)
        sel_zones = st.multiselect("Zona", options=zones, default=zones)
        sel_events = st.multiselect("Evento", options=events, default=[e for e in events if e in ("enter", "exit")] or events)
        show_presence = st.toggle("Incluir presence", value=False)

    st.markdown('<div class="muted">Fuente: ' + str(source_name) + " · Último evento: " + max_ts.isoformat() + "</div>", unsafe_allow_html=True)

    start_ts = pd.Timestamp(date_start).tz_localize("UTC")
    end_ts = (pd.Timestamp(date_end) + pd.Timedelta(days=1) - pd.Timedelta(milliseconds=1)).tz_localize("UTC")

    f = df.copy()
    f = f[(f["ts"] >= start_ts) & (f["ts"] <= end_ts)]
    if sel_sites:
        f = f[f["site"].isin(sel_sites)]
    if sel_channels:
        f = f[f["channel"].isin(sel_channels)]
    if sel_zones:
        f = f[f["zone_name"].isin(sel_zones)]
    if sel_events:
        f = f[f["event_type"].isin(sel_events)]
    if not show_presence:
        f = f[f["event_type"].isin(["enter", "exit"])]

    if f.empty:
        st.warning("No hay eventos con esos filtros.")
        return

    enters = int((f["event_type"] == "enter").sum())
    exits = int((f["event_type"] == "exit").sum())
    net = enters - exits
    tracks = f["track_id"].dropna().nunique()

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Entradas", f"{enters}")
    c2.metric("Salidas", f"{exits}")
    c3.metric("Neto", f"{net}")
    c4.metric("Tracks únicos (aprox.)", f"{int(tracks)}")

    t1, t2 = st.tabs(["Tendencias", "Detalle"])

    with t1:
        left, right = st.columns([2, 1])
        with left:
            daily = f.copy()
            daily["date"] = daily["ts"].dt.date
            daily = daily.groupby(["date", "event_type"], as_index=False).size()
            ch = (
                alt.Chart(daily)
                .mark_line(point=True)
                .encode(
                    x=alt.X("date:T", title="Fecha"),
                    y=alt.Y("size:Q", title="Eventos"),
                    color=alt.Color("event_type:N", title="Evento", scale=alt.Scale(range=["#10B981", "#EF4444", "#7C3AED", "#2E86DE"])),
                    tooltip=["date:T", "event_type:N", "size:Q"],
                )
                .properties(height=320)
            )
            st.altair_chart(ch, use_container_width=True)

            hourly = f.copy()
            hourly["hour"] = f["ts"].dt.hour
            hourly = hourly.groupby(["hour", "event_type"], as_index=False).size()
            ch2 = (
                alt.Chart(hourly)
                .mark_bar()
                .encode(
                    x=alt.X("hour:O", title="Hora"),
                    y=alt.Y("size:Q", title="Eventos"),
                    color=alt.Color("event_type:N", title="Evento", scale=alt.Scale(range=["#10B981", "#EF4444", "#7C3AED", "#2E86DE"])),
                    tooltip=["hour:O", "event_type:N", "size:Q"],
                )
                .properties(height=240)
            )
            st.altair_chart(ch2, use_container_width=True)

        with right:
            by_zone = f.copy()
            by_zone = by_zone.groupby(["zone_name", "event_type"], as_index=False).size()
            ch3 = (
                alt.Chart(by_zone)
                .mark_bar()
                .encode(
                    y=alt.Y("zone_name:N", sort="-x", title="Zona"),
                    x=alt.X("size:Q", title="Eventos"),
                    color=alt.Color("event_type:N", title="Evento", scale=alt.Scale(range=["#10B981", "#EF4444", "#7C3AED", "#2E86DE"])),
                    tooltip=["zone_name:N", "event_type:N", "size:Q"],
                )
                .properties(height=280)
            )
            st.altair_chart(ch3, use_container_width=True)

            by_cam = f.copy()
            by_cam = by_cam.groupby(["channel", "event_type"], as_index=False).size()
            ch4 = (
                alt.Chart(by_cam)
                .mark_bar()
                .encode(
                    y=alt.Y("channel:N", sort="-x", title="Cámara"),
                    x=alt.X("size:Q", title="Eventos"),
                    color=alt.Color("event_type:N", title="Evento", scale=alt.Scale(range=["#10B981", "#EF4444", "#7C3AED", "#2E86DE"])),
                    tooltip=["channel:N", "event_type:N", "size:Q"],
                )
                .properties(height=280)
            )
            st.altair_chart(ch4, use_container_width=True)

        with st.expander("Más gráficos (llamativos)", expanded=False):
            x1, x2 = st.columns([1.2, 1.0])
            with x1:
                st.subheader("Ocupación estimada (enter - exit)")
                bucket = st.selectbox("Granularidad", options=["15min", "1H", "1D"], index=1, key="occ_bucket")
                flow = f.copy()
                flow = flow[flow["event_type"].isin(["enter", "exit"])].copy()
                flow["delta"] = flow["event_type"].map({"enter": 1, "exit": -1}).astype("int64")
                flow = flow.set_index("ts").sort_index()
                series = flow["delta"].resample(bucket).sum().rename("net").to_frame().reset_index()
                series["occupancy"] = series["net"].cumsum().clip(lower=0)
                occ_chart = (
                    alt.Chart(series)
                    .mark_area(opacity=0.28, color="#2E86DE")
                    .encode(
                        x=alt.X("ts:T", title=""),
                        y=alt.Y("occupancy:Q", title="Personas (aprox.)"),
                        tooltip=[alt.Tooltip("ts:T", title="Tiempo"), alt.Tooltip("occupancy:Q", title="Ocupación"), alt.Tooltip("net:Q", title="Neto")],
                    )
                    .properties(height=220)
                )
                st.altair_chart(occ_chart, use_container_width=True)

                st.subheader("Promedio móvil (eventos/día)")
                d = f.copy()
                d["date"] = d["ts"].dt.floor("D")
                d = d.groupby(["date"], as_index=False).size().rename(columns={"size": "events"})
                d = d.sort_values("date")
                d["ma7"] = d["events"].rolling(7, min_periods=1).mean()
                base = alt.Chart(d).encode(x=alt.X("date:T", title=""))
                c_events = base.mark_bar(opacity=0.25, color="#7C3AED").encode(y=alt.Y("events:Q", title="Eventos"))
                c_ma = base.mark_line(color="#111827", strokeWidth=3).encode(y=alt.Y("ma7:Q", title=""))
                st.altair_chart((c_events + c_ma).properties(height=220), use_container_width=True)

            with x2:
                st.subheader("Heatmap: día de semana x hora")
                hm = f.copy()
                hm["dow"] = hm["ts"].dt.day_name()
                hm["hour"] = hm["ts"].dt.hour
                order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
                hm["dow"] = pd.Categorical(hm["dow"], categories=order, ordered=True)
                hm = hm.groupby(["dow", "hour"], as_index=False).size()
                heat = (
                    alt.Chart(hm)
                    .mark_rect(cornerRadius=4)
                    .encode(
                        x=alt.X("hour:O", title="Hora"),
                        y=alt.Y("dow:N", title=""),
                        color=alt.Color("size:Q", title="Eventos", scale=alt.Scale(scheme="tealblues")),
                        tooltip=["dow:N", "hour:O", "size:Q"],
                    )
                    .properties(height=220)
                )
                st.altair_chart(heat, use_container_width=True)

                st.subheader("Pareto por zona (80/20)")
                pz = f.copy()
                pz = pz.groupby(["zone_name"], as_index=False).size().rename(columns={"size": "events"})
                pz = pz.sort_values("events", ascending=False)
                pz["cum_events"] = pz["events"].cumsum()
                total = float(pz["events"].sum() or 1.0)
                pz["cum_pct"] = (pz["cum_events"] / total) * 100.0
                top = pz.head(12).copy()
                bars = (
                    alt.Chart(top)
                    .mark_bar(color="#10B981")
                    .encode(
                        y=alt.Y("zone_name:N", sort="-x", title=""),
                        x=alt.X("events:Q", title="Eventos"),
                        tooltip=["zone_name:N", "events:Q", alt.Tooltip("cum_pct:Q", format=".1f", title="% acumulado")],
                    )
                    .properties(height=260)
                )
                line = (
                    alt.Chart(top)
                    .mark_line(color="#EF4444", strokeWidth=3, point=True)
                    .encode(
                        y=alt.Y("zone_name:N", sort="-x", title=""),
                        x=alt.X("cum_pct:Q", title="% acumulado", scale=alt.Scale(domain=[0, 100])),
                        tooltip=[alt.Tooltip("cum_pct:Q", format=".1f", title="% acumulado")],
                    )
                )
                st.altair_chart(alt.layer(bars, line).resolve_scale(x="independent"), use_container_width=True)

        demo = f.copy()
        has_demo = demo.get("gender").notna().any() or demo.get("age").notna().any()
        if has_demo:
            st.subheader("Demografía (si está disponible)")
            d1, d2 = st.columns(2)
            with d1:
                g = demo[demo["gender"].notna()].copy()
                if not g.empty:
                    g = g.groupby("gender", as_index=False).size()
                    cg = (
                        alt.Chart(g)
                        .mark_arc(innerRadius=60)
                        .encode(
                            theta=alt.Theta("size:Q"),
                            color=alt.Color("gender:N", title="Género", scale=alt.Scale(range=["#2E86DE", "#7C3AED", "#10B981", "#EF4444"])),
                            tooltip=["gender:N", "size:Q"],
                        )
                        .properties(height=260)
                    )
                    st.altair_chart(cg, use_container_width=True)
                else:
                    st.caption("Sin gender.")
            with d2:
                a = demo[demo["age"].notna()].copy()
                if not a.empty:
                    a["age_bucket"] = a["age"].apply(_bucket_age)
                    a = a.groupby("age_bucket", as_index=False).size()
                    ca = (
                        alt.Chart(a)
                        .mark_bar()
                        .encode(
                            x=alt.X("age_bucket:N", title="Edad"),
                            y=alt.Y("size:Q", title="Personas"),
                            color=alt.value("#2E86DE"),
                            tooltip=["age_bucket:N", "size:Q"],
                        )
                        .properties(height=260)
                    )
                    st.altair_chart(ca, use_container_width=True)
                else:
                    st.caption("Sin age.")

    with t2:
        show_cols = [c for c in ["ts", "site", "channel", "event_type", "zone_name", "track_id", "gender", "age", "format"] if c in f.columns]
        out = f.sort_values("ts", ascending=False)[show_cols].copy()
        st.dataframe(out, use_container_width=True, height=520)
