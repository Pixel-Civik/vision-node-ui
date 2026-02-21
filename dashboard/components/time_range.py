import pandas as pd
from datetime import time

def get_tz():
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo("America/Lima")
    except Exception:
        from zoneinfo import ZoneInfo
        return ZoneInfo("UTC")

def build_time_range(df: pd.DataFrame, min_d: pd.Timestamp, max_d: pd.Timestamp, default_end_date: pd.Timestamp):
    import streamlit as st
    st.markdown("### Rango Temporal")
    tz_info = get_tz()
    try:
        local_ts_all = df["ts"].dt.tz_convert("America/Lima")
    except Exception:
        local_ts_all = df["ts"].dt.tz_convert("UTC")
    local_dates = local_ts_all.dt.floor("D")
    months = sorted(local_dates.dt.to_period("M").unique().tolist())
    month_labels = [str(m) for m in months]
    weeks = sorted(local_dates.dt.to_period("W-MON").unique().tolist())
    today = pd.Timestamp.now(tz=tz_info).date()
    default_start_date = min_d
    default_end_date_clamped = max_d if default_end_date > max_d else default_end_date
    default_start_time = time(0, 0)
    default_end_time = time(23, 59, 59)
    range_sel = st.selectbox(
        "Seleccionar período",
        options=["Período Completo", "Período Completo (Alineado)", "Día", "Semana", "Mes", "Personalizado"],
        index=1,
    )
    if range_sel == "Día":
        d_def = max(min(today, max_d), min_d)
        col_d1, col_d2, col_d3 = st.columns([2, 1.2, 1.2])
        with col_d1:
            day_sel = st.date_input("Día", value=d_def, min_value=min_d, max_value=max_d)
        use_hours = st.toggle("Filtrar por horas del día", value=False)
        if use_hours:
            with col_d2:
                h_start = st.time_input("Hora Inicio", value=default_start_time)
            with col_d3:
                h_end = st.time_input("Hora Fin", value=default_end_time)
        else:
            h_start = default_start_time
            h_end = default_end_time
        ts_start_local = pd.Timestamp.combine(day_sel, h_start).replace(tzinfo=tz_info)
        ts_end_local = pd.Timestamp.combine(day_sel, h_end).replace(tzinfo=tz_info)
        return ts_start_local.tz_convert("UTC"), ts_end_local.tz_convert("UTC"), tz_info
    if range_sel == "Semana":
        m_def_idx = 0
        for i, m in enumerate(months):
            if str(m) == f"{today.year}-{today.month:02d}":
                m_def_idx = i
                break
        col_w1, col_w2 = st.columns([2, 2])
        with col_w1:
            month_sel_label = st.selectbox("Mes", options=month_labels, index=m_def_idx)
        sel_year, sel_month = map(int, month_sel_label.split("-"))
        month_start = pd.Timestamp(sel_year, sel_month, 1, tz=tz_info)
        month_end = (month_start + pd.offsets.MonthEnd(0)).date()
        weeks_in_month = [w for w in weeks if (w.start_time.date() >= month_start.date()) and (w.start_time.date() <= month_end)]
        week_labels_in_month = [f"{str(w)} ({w.start_time.date()} - {(w.start_time + pd.Timedelta(days=6)).date()})" for w in weeks_in_month]
        w_def_idx = 0
        for i, w in enumerate(weeks_in_month):
            if w.start_time.date() <= today <= (w.start_time + pd.Timedelta(days=6)).date():
                w_def_idx = i
                break
        with col_w2:
            week_label_sel = st.selectbox("Semana", options=week_labels_in_month, index=w_def_idx)
        w_idx = week_labels_in_month.index(week_label_sel)
        week_sel = weeks_in_month[w_idx]
        week_start = max(week_sel.start_time.date(), min_d)
        week_end = min((week_sel.start_time + pd.Timedelta(days=6)).date(), max_d)
        ts_start_local = pd.Timestamp.combine(week_start, default_start_time).replace(tzinfo=tz_info)
        ts_end_local = pd.Timestamp.combine(week_end, default_end_time).replace(tzinfo=tz_info)
        return ts_start_local.tz_convert("UTC"), ts_end_local.tz_convert("UTC"), tz_info
    if range_sel == "Mes":
        m_def_idx = 0
        for i, m in enumerate(months):
            if str(m) == f"{today.year}-{today.month:02d}":
                m_def_idx = i
                break
        month_sel_label = st.selectbox("Mes", options=month_labels, index=m_def_idx)
        sel_year, sel_month = map(int, month_sel_label.split("-"))
        month_start = pd.Timestamp(sel_year, sel_month, 1, tz=tz_info).date()
        month_end = (pd.Timestamp(sel_year, sel_month, 1, tz=tz_info) + pd.offsets.MonthEnd(0)).date()
        month_start = max(month_start, min_d)
        month_end = min(month_end, max_d)
        ts_start_local = pd.Timestamp.combine(month_start, default_start_time).replace(tzinfo=tz_info)
        ts_end_local = pd.Timestamp.combine(month_end, default_end_time).replace(tzinfo=tz_info)
        return ts_start_local.tz_convert("UTC"), ts_end_local.tz_convert("UTC"), tz_info
    if range_sel == "Personalizado":
        c_c1, c_c2, c_c3, c_c4 = st.columns([2, 2, 2, 2])
        with c_c1:
            sel_start_date = st.date_input("Fecha de Inicio", value=default_start_date, min_value=min_d, max_value=max_d)
        with c_c2:
            sel_start_time = st.time_input("Hora de Inicio", value=default_start_time)
        with c_c3:
            sel_end_date = st.date_input("Fecha de Fin", value=default_end_date_clamped, min_value=min_d, max_value=max_d)
        with c_c4:
            sel_end_time = st.time_input("Hora de Fin", value=default_end_time)
        ts_start_local = pd.Timestamp.combine(sel_start_date, sel_start_time).replace(tzinfo=tz_info)
        ts_end_local = pd.Timestamp.combine(sel_end_date, sel_end_time).replace(tzinfo=tz_info)
        return ts_start_local.tz_convert("UTC"), ts_end_local.tz_convert("UTC"), tz_info
    if range_sel == "Período Completo":
        ts_start_local = pd.Timestamp.combine(min_d, default_start_time).replace(tzinfo=tz_info)
        ts_end_local = pd.Timestamp.combine(max_d, default_end_time).replace(tzinfo=tz_info)
        return ts_start_local.tz_convert("UTC"), ts_end_local.tz_convert("UTC"), tz_info
    if range_sel == "Período Completo (Alineado)":
        st.caption("Nota: el alineado real de enter/exit se aplica en el análisis (toggle “Alinear a rango común”). Aquí se mantiene el período completo para no ocultar zonas visitadas (time_in_zone).")
        ts_start_local = pd.Timestamp.combine(min_d, default_start_time).replace(tzinfo=tz_info)
        ts_end_local = pd.Timestamp.combine(max_d, default_end_time).replace(tzinfo=tz_info)
        return ts_start_local.tz_convert("UTC"), ts_end_local.tz_convert("UTC"), tz_info
    ts_start_local = pd.Timestamp.combine(default_start_date, default_start_time).replace(tzinfo=tz_info)
    ts_end_local = pd.Timestamp.combine(default_end_date_clamped, default_end_time).replace(tzinfo=tz_info)
    return ts_start_local.tz_convert("UTC"), ts_end_local.tz_convert("UTC"), tz_info
