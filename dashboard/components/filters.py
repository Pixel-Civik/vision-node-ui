import streamlit as st

def build_sidebar_filters(sites, channels, zones, events):
    st.markdown("### Parámetros de Análisis")

    presets = [
        "Personalizado",
        "Canal 101: Entradas/Salidas + Pasantes",
        "Canal 701: Solo Entrada (door_mixed_2)",
        "Tiempo en zona: Visit (zonas)",
    ]
    preset = st.selectbox("Vista rápida", options=presets, index=0, key="preset_view")
    prev = st.session_state.get("preset_view_prev", preset)
    if preset != prev:
        if preset == "Canal 101: Entradas/Salidas + Pasantes":
            st.session_state["filter_dow"] = list(range(7))
            st.session_state["filter_metric"] = "Eventos"
            st.session_state["filter_channels"] = ["101"] if "101" in channels else channels[:1]
            st.session_state["filter_events"] = [e for e in ["enter", "exit", "pasante"] if e in events]
            st.session_state["filter_hours"] = (7, 23)
        elif preset == "Canal 701: Solo Entrada (door_mixed_2)":
            st.session_state["filter_dow"] = list(range(7))
            st.session_state["filter_metric"] = "Eventos"
            st.session_state["filter_channels"] = ["701"] if "701" in channels else channels[:1]
            st.session_state["filter_events"] = ["enter"] if "enter" in events else [events[0]] if events else []
            if "door_mixed_1" in zones:
                st.session_state["filter_zones"] = ["door_mixed_1"]
            elif "door_mixed_2" in zones:
                st.session_state["filter_zones"] = ["door_mixed_2"]
            st.session_state["filter_hours"] = (7, 23)
        elif preset == "Tiempo en zona: Visit (zonas)":
            st.session_state["filter_dow"] = list(range(7))
            st.session_state["filter_metric"] = "Eventos"
            st.session_state["filter_events"] = ["visit"] if "visit" in events else [events[0]] if events else []
            if "queue" in zones:
                st.session_state["filter_zones"] = ["queue"]
            else:
                st.session_state["filter_zones"] = []
            st.session_state["filter_hours"] = (7, 23)
        st.session_state["preset_view_prev"] = preset
        st.rerun()
    else:
        st.session_state["preset_view_prev"] = preset

    sel_sites = st.multiselect("Ubicación", options=sites, default=sites[:1] if len(sites) >= 1 else sites, key="filter_sites")
    sel_channels = st.multiselect("Dispositivo", options=channels, default=channels, key="filter_channels")
    sel_zones = st.multiselect("Zona", options=zones, default=zones, key="filter_zones")
    allowed_events = [e for e in events if e in ("enter", "exit", "pasante", "visit")]
    sel_events = st.multiselect("Tipo de Evento", options=allowed_events, default=allowed_events, key="filter_events")
    hour_min, hour_max = st.slider("Rango Horario", min_value=0, max_value=23, value=(7, 23), key="filter_hours")
    dow_names = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
    dow_sel = st.multiselect("Día de la Semana", options=list(range(7)), default=list(range(7)), format_func=lambda i: dow_names[i], key="filter_dow")
    align_series = st.toggle("Alinear a rango común (enter/exit y dispositivos)", value=True, key="filter_align")
    metric_mode = st.selectbox("Métrica de Análisis", options=["Eventos", "Personas"], index=0, key="filter_metric")
    return sel_sites, sel_channels, sel_zones, sel_events, hour_min, hour_max, dow_sel, align_series, metric_mode
