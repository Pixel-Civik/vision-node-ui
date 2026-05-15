import altair as alt
import pandas as pd
import streamlit as st


def render_facade_compare(f: pd.DataFrame, ctx: dict) -> None:
    st.subheader("Pasantes vs Visitantes")
    st.caption(
        "Compara el **tráfico peatonal externo** (pasantes que pasan frente al local) "
        "con los **ingresos reales** (enter). "
        "La **tasa de conversión** indica qué porcentaje de quienes pasaron terminó ingresando — "
        "clave para medir el atractivo de la fachada y optimizar horarios de personal."
    )

    base = f[f["event_type"].isin(["pasante", "visitor", "enter"])].copy()
    if base.empty:
        st.info("No hay datos de pasantes/visitantes en el rango seleccionado.")
        return
    if "hour" not in base.columns or "local_date" not in base.columns:
        st.info("No hay datos horarios disponibles.")
        return

    days = int(base["local_date"].nunique()) if "local_date" in base.columns else 1
    pasantes_total = int((base["event_type"] == "pasante").sum())
    visitors_total = int((base["event_type"] == "visitor").sum())
    enters_total   = int((base["event_type"] == "enter").sum())
    conv_enter = (enters_total / pasantes_total * 100.0) if pasantes_total > 0 else 0.0
    conv_visitor = (visitors_total / pasantes_total * 100.0) if pasantes_total > 0 else 0.0

    c1, c2, c3, c4 = st.columns(4)
    c1.metric(
        "Pasantes/día",
        f"{round(pasantes_total / max(1, days)):,}",
        f"Total: {pasantes_total:,}",
        delta_color="off",
        help="Personas que pasan frente al local sin necesariamente ingresar.",
    )
    c2.metric(
        "Ingresos/día",
        f"{round(enters_total / max(1, days)):,}",
        f"Total: {enters_total:,}",
        delta_color="off",
        help="Personas que efectivamente ingresaron al local (evento enter).",
    )
    c3.metric(
        "Visitantes zona/día",
        f"{round(visitors_total / max(1, days)):,}",
        f"Total: {visitors_total:,}",
        delta_color="off",
        help="Personas detectadas en la zona de entrada/recepción (evento visitor).",
    )
    c4.metric(
        "Conversión",
        f"{conv_enter:.1f}%",
        help=(
            f"De cada 100 personas que pasan frente al local, {conv_enter:.1f} ingresan. "
            f"Visitor/Pasante: {conv_visitor:.1f}%."
        ),
    )

    # ── Pivot por hora ─────────────────────────────────────────────────────────
    hours = list(range(6, 24))
    by_hour_event = (
        base.groupby(["local_date", "hour", "event_type"], as_index=False)
        .size()
        .rename(columns={"size": "count"})
    )
    grid = pd.MultiIndex.from_product(
        [sorted(base["local_date"].unique().tolist()), hours, ["pasante", "visitor", "enter"]],
        names=["local_date", "hour", "event_type"],
    ).to_frame(index=False)
    by_hour_event = grid.merge(by_hour_event, on=["local_date", "hour", "event_type"], how="left")
    by_hour_event["count"] = pd.to_numeric(by_hour_event["count"], errors="coerce").fillna(0).astype(int)

    avg_hour = (
        by_hour_event.groupby(["hour", "event_type"], as_index=False)["count"]
        .mean()
        .rename(columns={"count": "avg"})
    )
    avg_wide = avg_hour.pivot(index="hour", columns="event_type", values="avg").fillna(0).reset_index()
    avg_wide["conv_enter_pct"] = (avg_wide["enter"] / avg_wide["pasante"].clip(lower=1) * 100).round(1)
    avg_wide["conv_visitor_pct"] = (avg_wide["visitor"] / avg_wide["pasante"].clip(lower=1) * 100).round(1)

    # ── Chart 1: Volumen promedio por hora ─────────────────────────────────────
    st.markdown("**Volumen promedio por hora (Lima)**")
    avg_long = avg_hour.copy()
    label_map = {"pasante": "Pasantes (vereda)", "enter": "Ingresos al local", "visitor": "Visitantes zona"}
    color_map = {"Pasantes (vereda)": "#6B7280", "Ingresos al local": "#10B981", "Visitantes zona": "#3B82F6"}
    avg_long["label"] = avg_long["event_type"].map(label_map)
    avg_long = avg_long[avg_long["label"].notna()]

    ch_vol = (
        alt.Chart(avg_long)
        .mark_line(point=True, strokeWidth=2)
        .encode(
            x=alt.X("hour:O", title="Hora (Lima)"),
            y=alt.Y("avg:Q", title="Promedio de eventos"),
            color=alt.Color(
                "label:N",
                title="",
                scale=alt.Scale(
                    domain=list(color_map.keys()),
                    range=list(color_map.values()),
                ),
            ),
            tooltip=[
                alt.Tooltip("hour:O", title="Hora"),
                alt.Tooltip("label:N", title="Tipo"),
                alt.Tooltip("avg:Q", format=".1f", title="Promedio/día"),
            ],
        )
        .properties(height=280)
    )
    st.altair_chart(ch_vol, use_container_width=True)

    # ── Chart 2: Tasa de conversión por hora ───────────────────────────────────
    st.markdown("**Tasa de conversión por hora** — % de pasantes que ingresan")
    st.caption(
        "Una tasa alta a mediodía y baja a las 17h indica que el horario de mayor "
        "tráfico peatonal **no coincide** con el de mayor conversión. "
        "Considera acciones de captación (promociones, señalización) en horas de alto tráfico y baja conversión."
    )

    conv_df = avg_wide[["hour", "conv_enter_pct", "pasante"]].copy()
    conv_df = conv_df[conv_df["pasante"] > 0]

    line_conv = (
        alt.Chart(conv_df)
        .mark_line(point=True, strokeWidth=3, color="#10B981")
        .encode(
            x=alt.X("hour:O", title="Hora (Lima)"),
            y=alt.Y("conv_enter_pct:Q", title="Conversión (%)", scale=alt.Scale(domain=[0, 100])),
            tooltip=[
                alt.Tooltip("hour:O", title="Hora"),
                alt.Tooltip("conv_enter_pct:Q", format=".1f", title="Conversión (%)"),
                alt.Tooltip("pasante:Q", format=".0f", title="Pasantes/día (avg)"),
            ],
        )
    )

    # Background bands to signal low (<20%), medium (20-40%), high (>40%) zones
    thresholds = pd.DataFrame([
        {"y": 0,  "y2": 20,  "zone": "Baja (<20%)"},
        {"y": 20, "y2": 40,  "zone": "Media (20-40%)"},
        {"y": 40, "y2": 100, "zone": "Alta (>40%)"},
    ])
    band = (
        alt.Chart(thresholds)
        .mark_rect(opacity=0.08)
        .encode(
            y=alt.Y("y:Q", scale=alt.Scale(domain=[0, 100])),
            y2="y2:Q",
            color=alt.Color(
                "zone:N",
                title="Zona",
                scale=alt.Scale(
                    domain=["Baja (<20%)", "Media (20-40%)", "Alta (>40%)"],
                    range=["#EF4444", "#F59E0B", "#10B981"],
                ),
            ),
        )
    )

    bars_pasante = (
        alt.Chart(conv_df)
        .mark_bar(opacity=0.15, color="#6B7280")
        .encode(
            x=alt.X("hour:O", title="Hora (Lima)"),
            y=alt.Y("pasante:Q", title="Pasantes/día (avg)"),
            tooltip=[alt.Tooltip("pasante:Q", format=".0f", title="Pasantes/día (avg)")],
        )
    )

    chart_conv = (
        alt.layer(band, bars_pasante, line_conv)
        .resolve_scale(y="independent")
        .properties(height=300)
    )
    st.altair_chart(chart_conv, use_container_width=True)

    # ── Tabla resumen ──────────────────────────────────────────────────────────
    with st.expander("Ver tabla de conversión por hora"):
        display = avg_wide[["hour", "pasante", "enter", "visitor", "conv_enter_pct"]].copy()
        display.columns = ["Hora", "Pasantes/día", "Ingresos/día", "Visitantes/día", "Conversión (%)"]
        display = display.set_index("Hora")
        for col in ["Pasantes/día", "Ingresos/día", "Visitantes/día"]:
            display[col] = display[col].round(1)
        st.dataframe(display, use_container_width=True)
