import streamlit as st

def build_sidebar_filters(sites, channels, zones, events):
    st.markdown("### Parámetros de Análisis")
    sel_sites = st.multiselect("Ubicación", options=sites, default=sites[:1] if len(sites) >= 1 else sites)
    sel_channels = st.multiselect("Dispositivo", options=channels, default=channels)
    sel_zones = st.multiselect("Zona", options=zones, default=zones)
    allowed_events = [e for e in events if e in ("enter", "exit")]
    sel_events = st.multiselect("Tipo de Evento", options=allowed_events, default=allowed_events)
    hour_min, hour_max = st.slider("Rango Horario", min_value=0, max_value=23, value=(9, 23))
    dow_names = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
    dow_sel = st.multiselect("Día de la Semana", options=list(range(7)), default=list(range(7)), format_func=lambda i: dow_names[i])
    align_series = st.toggle("Alinear a rango común (enter/exit y dispositivos)", value=True)
    metric_mode = st.selectbox("Métrica de Análisis", options=["Eventos", "Personas"], index=0)
    return sel_sites, sel_channels, sel_zones, sel_events, hour_min, hour_max, dow_sel, align_series, metric_mode
