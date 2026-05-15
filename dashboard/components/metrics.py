import streamlit as st
from ..data import supabase_rpc
from ..style.styles import skeleton_metrics


def render_metrics(ctx: dict, start_ts, end_ts) -> tuple[int, int, int, dict]:
    sb_url = str(ctx.get("sb_url") or "").strip()
    sb_key = str(ctx.get("sb_key") or "").strip()
    if not sb_url or not sb_key:
        st.warning("Faltan credenciales de Supabase en el .env.")
        return 0, 0, 0, {}

    payload = {
        "p_start_ts": start_ts.isoformat(),
        "p_end_ts": end_ts.isoformat(),
        "p_sites": ctx.get("sel_sites"),
        "p_channels": ctx.get("sel_channels"),
        "p_zones": ctx.get("sel_zones"),
        "p_hour_min": ctx.get("hour_min"),
        "p_hour_max": ctx.get("hour_max"),
        "p_dows": ctx.get("dow_sel"),
    }

    slot = st.empty()
    with slot.container():
        skeleton_metrics(3)

    rows = supabase_rpc(sb_url, sb_key, "dashboard_kpi_enter_exit", payload)
    slot.empty()
    r = rows[0] if rows else {}

    enters = int(r.get("enters") or 0)
    exits  = int(r.get("exits")  or 0)
    net    = int(r.get("net")    or (enters - exits))
    tracks = int(r.get("unique_tracks") or 0)
    days   = int(r.get("days")   or 1)
    d      = max(1, days)
    total_ev = enters + exits

    c1, c2, c3 = st.columns(3)
    c1.metric(
        "Entradas/día (prom.)",
        f"{enters / d:.1f}",
        f"Total: {enters:,}",
        delta_color="off",
        help=(
            f"Promedio diario de ingresos al local detectados por las cámaras. "
            f"Total acumulado en {days} día(s): {enters:,} eventos."
        ),
    )
    c2.metric(
        "Salidas/día (prom.)",
        f"{exits / d:.1f}",
        f"Total: {exits:,}",
        delta_color="off",
        help=(
            f"Promedio diario de salidas del local detectadas por las cámaras. "
            f"Total acumulado en {days} día(s): {exits:,} eventos."
        ),
    )
    c3.metric(
        "Neto/día (prom.)",
        f"{net / d:.1f}",
        f"Total: {net:,}",
        delta_color="off",
        help=(
            "Diferencia entre Entradas y Salidas por día. "
            "Un valor alto y positivo puede indicar salidas no capturadas por los sensores."
        ),
    )

    exit_rate = round(exits / max(1, enters) * 100.0, 1)
    st.caption(
        f"Período: **{days}** día(s)  ·  "
        f"Tasa de salida capturada: **{exit_rate}%** de entradas"
        + ("  ·  ⚠️ Tasa < 80%: posibles salidas no detectadas" if exit_rate < 80 else "")
    )

    with st.expander("¿Qué significa cada indicador?", expanded=False):
        st.markdown(
            """
| Indicador | Qué mide | Cómo se calcula |
|---|---|---|
| **Entradas/día (prom.)** | Promedio diario de personas que **ingresaron** al local | Total eventos `enter` ÷ días del período |
| **Salidas/día (prom.)** | Promedio diario de personas que **salieron** del local | Total eventos `exit` ÷ días del período |
| **Neto/día (prom.)** | Diferencia diaria entre entradas y salidas | (Total `enter` − Total `exit`) ÷ días |
"""
        )
        st.markdown("---")
        st.markdown(
            f"""
**¿Qué es el Neto?**
Es la diferencia entre cuántas personas entraron y cuántas salieron.
- Neto = {enters:,} entradas − {exits:,} salidas = **{net:,}**
- Un Neto alto y positivo indica que los sensores de salida no están capturando
  todos los eventos (personas que salen por otra puerta o fuera del campo de cámara).
- Un Neto cercano a **cero** indica buena cobertura de ambos eventos.

El ícono **ℹ️** junto al nombre de cada tarjeta muestra más detalle al pasar el cursor.
"""
        )
        if exit_rate < 80:
            st.warning(
                f"La tasa de salida capturada es **{exit_rate}%**. "
                "Se recomienda revisar que los sensores de salida estén correctamente configurados "
                "y cubran todas las puertas del local."
            )

    kpi_dict = {
        "enters":      enters,
        "exits":       exits,
        "net":         net,
        "tracks":      tracks,
        "days":        days,
        "enters_day":  f"{enters / d:.1f}",
        "exits_day":   f"{exits / d:.1f}",
        "net_day":     f"{net / d:.1f}",
        "tracks_day":  f"{float(tracks) / d:.1f}",
        "exit_rate_pct": exit_rate,
    }
    return enters, exits, total_ev, kpi_dict
