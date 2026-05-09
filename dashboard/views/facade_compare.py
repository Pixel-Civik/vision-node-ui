import altair as alt
import pandas as pd
import streamlit as st


def _fmt_hour_label(h: int) -> str:
    from datetime import datetime as dt_lib
    return dt_lib(2000, 1, 1, int(h), 0).strftime("%I %p").lstrip("0")


def render_facade_compare(f: pd.DataFrame, ctx: dict) -> None:
    st.subheader("Pasantes vs Visitantes")

    base = f.copy()
    base = base[base["event_type"].isin(["pasante", "visitor", "enter"])].copy()
    if base.empty:
        st.info("No hay datos de pasantes/visitantes en el rango seleccionado.")
        return
    if "hour" not in base.columns or "local_date" not in base.columns:
        st.info("No hay datos horarios disponibles.")
        return

    base["kind"] = base["event_type"].map(
        {"pasante": "passers", "visitor": "passers", "enter": "visitors"}
    )
    base = base[base["kind"].notna()].copy()

    days = int(base["local_date"].nunique()) if "local_date" in base.columns else 1
    passers_total = int((base["kind"] == "passers").sum())
    visitors_total = int((base["kind"] == "visitors").sum())

    c1, c2, c3 = st.columns(3)
    c1.metric("Pasantes (total)", f"{passers_total}", f"{round(passers_total / max(1, days), 2)} / día")
    c2.metric("Visitantes (ingreso, total)", f"{visitors_total}", f"{round(visitors_total / max(1, days), 2)} / día")
    conv = (visitors_total / passers_total) * 100.0 if passers_total > 0 else 0.0
    c3.metric("Conversión (enter / pasantes)", f"{round(conv, 2)}%")

    counts = (
        base.groupby(["local_date", "hour", "kind"], as_index=False)
        .size()
        .rename(columns={"size": "count"})
    )
    hours = list(range(6, 24))
    grid = pd.MultiIndex.from_product(
        [sorted(base["local_date"].unique().tolist()), hours, ["passers", "visitors"]],
        names=["local_date", "hour", "kind"],
    ).to_frame(index=False)
    counts = grid.merge(counts, on=["local_date", "hour", "kind"], how="left")
    counts["count"] = pd.to_numeric(counts["count"], errors="coerce").fillna(0).astype(int)

    avg = counts.groupby(["hour", "kind"], as_index=False)["count"].mean().rename(columns={"count": "avg_count"})
    avg["label"] = avg["kind"].map({"passers": "Pasantes (vereda)", "visitors": "Visitantes (ingreso)"})
    avg["hour_label"] = avg["hour"].apply(_fmt_hour_label)
    st.markdown("**Promedio por Hora (Lima)**")
    ch_hour = (
        alt.Chart(avg)
        .mark_line(point=True, strokeWidth=3)
        .encode(
            x=alt.X("hour_label:N", title="Hora (Lima)", sort=[_fmt_hour_label(h) for h in range(6, 24)]),
            y=alt.Y("avg_count:Q", title="Promedio"),
            color=alt.Color("label:N", title=""),
            tooltip=["hour_label:N", "label:N", alt.Tooltip("avg_count:Q", format=".2f", title="Promedio")],
        )
        .properties(height=280)
    )
    st.altair_chart(ch_hour, use_container_width=True)
