import streamlit as st
from ..data import supabase_rpc

def render_metrics(ctx: dict, start_ts, end_ts):
    sb_url = str(ctx.get("sb_url") or "").strip()
    sb_key = str(ctx.get("sb_key") or "").strip()
    if not sb_url or not sb_key:
        st.warning("Faltan credenciales de Supabase en el .env.")
        return 0, 0, 0
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
    rows = supabase_rpc(sb_url, sb_key, "dashboard_kpi_enter_exit", payload)
    r = rows[0] if rows else {}
    enters = int(r.get("enters") or 0)
    exits = int(r.get("exits") or 0)
    net = int(r.get("net") or (enters - exits))
    tracks = int(r.get("unique_tracks") or 0)
    days = int(r.get("days") or 1)
    d = max(1, days)
    total_ev = enters + exits
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Entradas/día (prom)", f"{round(enters / d, 2)}", f"Total {enters}")
    c2.metric("Salidas/día (prom)", f"{round(exits / d, 2)}", f"Total {exits}")
    c3.metric("Neto/día (prom)", f"{round(net / d, 2)}", f"Total {net}")
    c4.metric("Personas/día (prom)", f"{round(float(tracks) / d, 2)}", f"Total {int(tracks)}")
    return enters, exits, total_ev
