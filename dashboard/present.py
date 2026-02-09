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


def _pick_bucket(start_ts: pd.Timestamp, end_ts: pd.Timestamp) -> str:
    dur = end_ts - start_ts
    if dur <= pd.Timedelta(hours=6):
        return "5min"
    if dur <= pd.Timedelta(days=2):
        return "15min"
    if dur <= pd.Timedelta(days=14):
        return "1H"
    if dur <= pd.Timedelta(days=60):
        return "6H"
    return "1D"


def _palette() -> dict:
    return {"enter": "#10B981", "exit": "#EF4444", "presence": "#2E86DE"}


def _utc_scale() -> alt.Scale:
    return alt.Scale(type="utc")


def _utc_scale_domain(domain) -> alt.Scale:
    return alt.Scale(type="utc", domain=domain)


def _ts_counts(f: pd.DataFrame, bucket: str) -> pd.DataFrame:
    base = f.copy()
    base = base[base["ts"].notna()].copy()
    base = base.set_index("ts").sort_index()
    g = base.groupby("event_type").resample(bucket).size().rename("count").reset_index()
    return g


def _ts_metric(f: pd.DataFrame, bucket: str, metric: str) -> pd.DataFrame:
    base = f.copy()
    base = base[base["ts"].notna()].copy()
    base = base.set_index("ts").sort_index()
    if metric == "personas":
        if "track_id" not in base.columns:
            g = base.groupby("event_type").resample(bucket).size().rename("count").reset_index()
            return g
        g = (
            base.groupby(["event_type", pd.Grouper(freq=bucket)])["track_id"]
            .nunique(dropna=True)
            .rename("count")
            .reset_index()
            .rename(columns={"ts": "ts"})
        )
        return g
    g = base.groupby("event_type").resample(bucket).size().rename("count").reset_index()
    return g


def _daily_counts(f: pd.DataFrame) -> pd.DataFrame:
    d = f.copy()
    d = d[d["ts"].notna()].copy()
    d["date"] = d["ts"].dt.floor("D")
    d = d.groupby(["date", "event_type"], as_index=False).size().rename(columns={"size": "count"})
    return d


def _hourly_avg(f: pd.DataFrame, col: str, value_name: str) -> pd.DataFrame:
    a = f.copy()
    a = a[a["ts"].notna()].copy()
    a["date"] = a["ts"].dt.floor("D")
    a["hour"] = a["ts"].dt.hour
    a = a.groupby(["date", "hour", col], as_index=False).size().rename(columns={"size": value_name})
    a = a.groupby(["hour", col], as_index=False)[value_name].mean()
    return a


def _align_overlap_window(f: pd.DataFrame, event_types: list[str]) -> tuple[pd.Timestamp | None, pd.Timestamp | None]:
    mins = []
    maxs = []
    for et in event_types:
        s = f.loc[f["event_type"] == et, "ts"].dropna()
        if s.empty:
            return None, None
        mins.append(s.min())
        maxs.append(s.max())
    start = max(mins)
    end = min(maxs)
    if start > end:
        return None, None
    return start, end


def _align_common_window(f: pd.DataFrame, event_types: list[str]) -> tuple[pd.Timestamp | None, pd.Timestamp | None]:
    start, end = _align_overlap_window(f, event_types)
    if start is None or end is None:
        return None, None
    if "channel" in f.columns:
        s = f.loc[f["event_type"].isin(event_types), ["channel", "ts"]].dropna()
        if not s.empty:
            end_cam = s.groupby("channel", as_index=False)["ts"].max()["ts"].min()
            if pd.notna(end_cam):
                end = min(end, end_cam)
    if start > end:
        return None, None
    return start, end


def _with_hour_and_dow(f: pd.DataFrame) -> pd.DataFrame:
    out = f.copy()
    # Convertir a hora local (Perú/UTC-5) para visualización correcta de horas y días
    try:
        # Intentar usar zona horaria explícita
        local_ts = out["ts"].dt.tz_convert("America/Lima")
    except Exception:
        # Fallback a offset fijo UTC-5 si la zona no está disponible
        local_ts = out["ts"].dt.tz_convert(pd.Timedelta(hours=-5))
    
    out["hour"] = local_ts.dt.hour
    out["dow"] = local_ts.dt.dayofweek
    # Guardamos también la fecha local para cálculos de días únicos
    out["local_date"] = local_ts.dt.floor("D")
    return out


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
        hour_min, hour_max = st.slider("Horas", min_value=0, max_value=23, value=(0, 23))
        dow_names = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
        dow_sel = st.multiselect("Día de semana", options=list(range(7)), default=list(range(7)), format_func=lambda i: dow_names[i])
        align_series = st.toggle("Alinear a rango común (enter/exit y cámaras)", value=True)
        metric_mode = st.selectbox("Medida", options=["Eventos", "Personas"], index=0)

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
    f = _with_hour_and_dow(f)
    f = f[(f["hour"] >= hour_min) & (f["hour"] <= hour_max)]
    if dow_sel:
        f = f[f["dow"].isin(dow_sel)]

    if f.empty:
        st.warning("No hay eventos con esos filtros.")
        return

    enters = int((f["event_type"] == "enter").sum())
    exits = int((f["event_type"] == "exit").sum())
    net = enters - exits
    tracks = f["track_id"].dropna().nunique()
    total_ev = int(len(f))
    pal = _palette()

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Entradas", f"{enters}")
    c2.metric("Salidas", f"{exits}")
    c3.metric("Neto", f"{net}")
    c4.metric("Tracks únicos (aprox.)", f"{int(tracks)}")

    t1, t2 = st.tabs(["Resumen", "Detalle"])

    with t1:
        left, right = st.columns([2, 1])
        with left:
            st.subheader("Entradas y salidas a lo largo del tiempo")
            bucket = _pick_bucket(start_ts, end_ts)
            f_ee = f[f["event_type"].isin(["enter", "exit"])].copy()
            x_scale = _utc_scale()
            if align_series:
                a_start, a_end = _align_common_window(f_ee, ["enter", "exit"])
                if a_start is not None and a_end is not None:
                    f_ee = f_ee[(f_ee["ts"] >= a_start) & (f_ee["ts"] <= a_end)].copy()
                    x_scale = _utc_scale_domain([a_start, a_end])

            metric = "eventos" if metric_mode == "Eventos" else "personas"
            y_title = "Eventos" if metric == "eventos" else "Personas (tracks únicos)"
            g = _ts_metric(f_ee, bucket=bucket, metric=metric)
            if g.empty:
                st.info("No hay eventos enter/exit en este rango.")
            else:
                ch = (
                    alt.Chart(g)
                    .mark_line(point=False, strokeWidth=3)
                    .encode(
                        x=alt.X("ts:T", title="", scale=x_scale),
                        y=alt.Y("count:Q", title=y_title),
                        color=alt.Color(
                            "event_type:N",
                            title="",
                            scale=alt.Scale(domain=list(pal.keys()), range=list(pal.values())),
                        ),
                        tooltip=[alt.Tooltip("ts:T", title="Tiempo"), "event_type:N", "count:Q"],
                    )
                    .properties(height=320)
                )
                st.altair_chart(ch, use_container_width=True)

            st.subheader("Promedio por hora (9 AM - 11 PM)")
            ha_base = f_ee.copy()
            if metric == "personas" and "track_id" in ha_base.columns:
                ha_base = ha_base.copy()
                ha_base["date"] = ha_base["local_date"] # Usar fecha local
                ha_base = ha_base.groupby(["date", "hour", "event_type"], as_index=False)["track_id"].nunique(dropna=True).rename(columns={"track_id": "events_avg"})
                ha = ha_base.groupby(["hour", "event_type"], as_index=False)["events_avg"].mean()
            else:
                # Para eventos, usamos la fecha local para agrupar
                a = ha_base.copy()
                a["date"] = a["local_date"]
                a = a.groupby(["date", "hour", "event_type"], as_index=False).size().rename(columns={"size": "events_avg"})
                ha = a.groupby(["hour", "event_type"], as_index=False)["events_avg"].mean()
            
            # Filtrar rango 9 AM a 11 PM
            ha = ha[(ha["hour"] >= 9) & (ha["hour"] <= 23)].copy()
            
            if ha.empty:
                st.info("No hay datos en el horario 9 AM - 11 PM.")
            else:
                # Formatear hora AM/PM
                from datetime import datetime as dt_lib
                def fmt_hour(h):
                    return dt_lib(2000, 1, 1, h, 0).strftime("%I %p").lstrip("0")
                
                ha["hour_label"] = ha["hour"].apply(fmt_hour)
                
                y_avg_title = "Eventos promedio" if metric == "eventos" else "Personas promedio"
                ch2 = (
                    alt.Chart(ha)
                    .mark_line(point=True, strokeWidth=3)
                    .encode(
                        x=alt.X("hour_label:N", title="Hora", sort=alt.EncodingSortField(field="hour", order="ascending")),
                        y=alt.Y("events_avg:Q", title=y_avg_title),
                        color=alt.Color("event_type:N", title="", scale=alt.Scale(domain=list(pal.keys()), range=list(pal.values()))),
                        tooltip=["hour_label:N", "event_type:N", alt.Tooltip("events_avg:Q", format=".2f", title="Promedio")],
                    )
                    .properties(height=240)
                )
                st.altair_chart(ch2, use_container_width=True)

            st.subheader("Promedio por día de semana")
            dw = f_ee.copy()
            # Contar total de eventos por día de semana
            dw_counts = dw.groupby(["dow", "event_type"], as_index=False).size().rename(columns={"size": "total_count"})
            
            # Contar cuántos días únicos (fechas) existen para cada día de semana en el rango seleccionado
            # Usamos local_date para asegurar que el lunes sea lunes localmente
            days_per_dow = dw.groupby("dow")["local_date"].nunique().rename("num_days").reset_index()
            
            # Unir y calcular promedio
            dw_avg = pd.merge(dw_counts, days_per_dow, on="dow", how="left")
            dw_avg["avg_count"] = dw_avg["total_count"] / dw_avg["num_days"]
            
            dw_avg["dow_name"] = dw_avg["dow"].map({0: "Lun", 1: "Mar", 2: "Mié", 3: "Jue", 4: "Vie", 5: "Sáb", 6: "Dom"})
            dw_avg["dow_name"] = pd.Categorical(dw_avg["dow_name"], categories=["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"], ordered=True)
            
            if not dw_avg.empty:
                cwd = (
                    alt.Chart(dw_avg)
                    .mark_line(point=True, strokeWidth=3)
                    .encode(
                        x=alt.X("dow_name:N", title=""),
                        y=alt.Y("avg_count:Q", title="Promedio de Eventos"),
                        color=alt.Color("event_type:N", title="", scale=alt.Scale(domain=list(pal.keys()), range=list(pal.values()))),
                        tooltip=["dow_name:N", "event_type:N", alt.Tooltip("avg_count:Q", format=".1f", title="Promedio"), alt.Tooltip("num_days:Q", title="Días contados")],
                    )
                    .properties(height=220)
                )
                st.altair_chart(cwd, use_container_width=True)

        with right:
            st.subheader("Distribución enter/exit")
            donut_df = pd.DataFrame(
                [{"event_type": "enter", "count": enters}, {"event_type": "exit", "count": exits}]
            )
            donut_df["pct"] = (donut_df["count"] / max(1, donut_df["count"].sum())) * 100.0
            donut = (
                alt.Chart(donut_df)
                .mark_arc(innerRadius=70)
                .encode(
                    theta=alt.Theta("count:Q"),
                    color=alt.Color("event_type:N", title="", scale=alt.Scale(domain=list(pal.keys()), range=list(pal.values()))),
                    tooltip=["event_type:N", "count:Q", alt.Tooltip("pct:Q", format=".1f", title="%")],
                )
                .properties(height=240)
            )
            st.altair_chart(donut, use_container_width=True)

            days = int((pd.Timestamp(date_end) - pd.Timestamp(date_start)).days) + 1
            st.subheader("Indicadores promedio")
            st.metric("Eventos/día (promedio)", f"{round(total_ev / max(1, days), 2)}")
            if enters + exits > 0:
                st.metric("Enter %", f"{round((enters / max(1, enters + exits)) * 100.0, 1)}%")
                st.metric("Exit %", f"{round((exits / max(1, enters + exits)) * 100.0, 1)}%")

            by_zone = f.copy()
            by_zone = by_zone.groupby(["zone_name", "event_type"], as_index=False).size()
            ch3 = (
                alt.Chart(by_zone)
                .mark_bar()
                .encode(
                    y=alt.Y("zone_name:N", sort="-x", title="Zona"),
                    x=alt.X("size:Q", title="Eventos"),
                    color=alt.Color("event_type:N", title="Evento", scale=alt.Scale(domain=list(pal.keys()), range=list(pal.values()))),
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
                    color=alt.Color("event_type:N", title="Evento", scale=alt.Scale(domain=list(pal.keys()), range=list(pal.values()))),
                    tooltip=["channel:N", "event_type:N", "size:Q"],
                )
                .properties(height=280)
            )
            st.altair_chart(ch4, use_container_width=True)

        with st.expander("Análisis ejecutivo (avanzado)", expanded=False):
            x1, x2 = st.columns([1.2, 1.0])
            with x1:
                st.subheader("Ocupación estimada (enter - exit)")
                bucket = st.selectbox("Granularidad", options=["15min", "1H", "1D"], index=1, key="occ_bucket")
                flow = f.copy()
                flow = flow[flow["event_type"].isin(["enter", "exit"])].copy()
                if flow.empty:
                    st.info("Sin enter/exit para ocupación.")
                else:
                    flow["delta"] = flow["event_type"].map({"enter": 1, "exit": -1}).astype("int64")
                    flow = flow.set_index("ts").sort_index()
                    series = flow["delta"].resample(bucket).sum().rename("net").to_frame().reset_index()
                    series["occupancy"] = series["net"].cumsum().clip(lower=0)
                    occ_chart = (
                        alt.Chart(series)
                        .mark_area(opacity=0.28, color="#2E86DE")
                        .encode(
                        x=alt.X("ts:T", title="", scale=_utc_scale()),
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
            st.subheader("Demografía (promedios y %)")

            if demo.get("gender").notna().any():
                g1, g2 = st.columns([1.4, 1.0])
                gg = demo[demo["gender"].notna()].copy()

                with g1:
                    st.markdown("**Género: promedio por hora**")
                    hg = _hourly_avg(gg, col="gender", value_name="avg_count")
                    if hg.empty:
                        st.caption("Sin datos suficientes.")
                    else:
                        chg = (
                            alt.Chart(hg)
                            .mark_line(point=True, strokeWidth=3)
                            .encode(
                                x=alt.X("hour:O", title="Hora"),
                                y=alt.Y("avg_count:Q", title="Promedio"),
                                color=alt.Color("gender:N", title=""),
                                tooltip=["hour:O", "gender:N", alt.Tooltip("avg_count:Q", format=".2f", title="Promedio")],
                            )
                            .properties(height=240)
                        )
                        st.altair_chart(chg, use_container_width=True)

                with g2:
                    st.markdown("**Género: % del total**")
                    pct = gg.groupby("gender", as_index=False).size().rename(columns={"size": "count"})
                    pct["pct"] = (pct["count"] / max(1, pct["count"].sum())) * 100.0
                    dp = (
                        alt.Chart(pct)
                        .mark_arc(innerRadius=70)
                        .encode(
                            theta=alt.Theta("count:Q"),
                            color=alt.Color("gender:N", title=""),
                            tooltip=["gender:N", "count:Q", alt.Tooltip("pct:Q", format=".1f", title="%")],
                        )
                        .properties(height=240)
                    )
                    st.altair_chart(dp, use_container_width=True)

                st.markdown("**Género: por día de semana**")
                gd = gg.copy()
                gd = gd.groupby(["dow", "gender"], as_index=False).size().rename(columns={"size": "count"})
                gd["dow_name"] = gd["dow"].map({0: "Lun", 1: "Mar", 2: "Mié", 3: "Jue", 4: "Vie", 5: "Sáb", 6: "Dom"})
                gd["dow_name"] = pd.Categorical(gd["dow_name"], categories=["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"], ordered=True)
                if not gd.empty:
                    cgday = (
                        alt.Chart(gd)
                        .mark_bar()
                        .encode(
                            x=alt.X("dow_name:N", title=""),
                            y=alt.Y("count:Q", title="Eventos"),
                            color=alt.Color("gender:N", title=""),
                            tooltip=["dow_name:N", "gender:N", "count:Q"],
                        )
                        .properties(height=220)
                    )
                    st.altair_chart(cgday, use_container_width=True)

            if demo.get("age").notna().any():
                a1, a2 = st.columns([1.4, 1.0])
                aa = demo[demo["age"].notna()].copy()
                aa["age"] = pd.to_numeric(aa["age"], errors="coerce")
                aa = aa[aa["age"].notna()].copy()
                if aa.empty:
                    with a1:
                        st.caption("Sin edad numérica válida.")
                    with a2:
                        st.caption("Sin edad numérica válida.")
                else:
                    with a1:
                        st.markdown("**Edad: promedio por día**")
                        aa["date"] = aa["ts"].dt.floor("D")
                        ad = aa.groupby("date", as_index=False)["age"].mean().rename(columns={"age": "age_avg"})
                        ca2 = (
                            alt.Chart(ad)
                            .mark_line(point=True, strokeWidth=3, color="#7C3AED")
                            .encode(
                                x=alt.X("date:T", title="Fecha", scale=_utc_scale()),
                                y=alt.Y("age_avg:Q", title="Edad promedio"),
                                tooltip=["date:T", alt.Tooltip("age_avg:Q", format=".1f", title="Edad promedio")],
                            )
                            .properties(height=240)
                        )
                        st.altair_chart(ca2, use_container_width=True)

                    with a2:
                        st.markdown("**Edad: % por rango**")
                        aa["age_bucket"] = aa["age"].apply(_bucket_age)
                        ab = aa.groupby("age_bucket", as_index=False).size().rename(columns={"size": "count"})
                        ab["pct"] = (ab["count"] / max(1, ab["count"].sum())) * 100.0
                        cab = (
                            alt.Chart(ab)
                            .mark_bar(color="#2E86DE")
                            .encode(
                                y=alt.Y("age_bucket:N", sort="-x", title=""),
                                x=alt.X("pct:Q", title="%"),
                                tooltip=["age_bucket:N", "count:Q", alt.Tooltip("pct:Q", format=".1f", title="%")],
                            )
                            .properties(height=240)
                        )
                        st.altair_chart(cab, use_container_width=True)

    with t2:
        show_cols = [c for c in ["ts", "site", "channel", "event_type", "zone_name", "track_id", "gender", "age", "format"] if c in f.columns]
        out = f.sort_values("ts", ascending=False)[show_cols].copy()
        st.dataframe(out, use_container_width=True, height=520)
