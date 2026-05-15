import streamlit as st


def build_sidebar_filters(sites, channels, zones, events):
    st.markdown("### Filtros")

    sel_sites = st.multiselect(
        "Sede",
        options=sites,
        default=sites,
        key="filter_sites",
        help="Selecciona una o varias sedes a analizar.",
    )

    sel_channels = st.multiselect(
        "Cámara",
        options=channels,
        default=channels,
        key="filter_channels",
        help="Filtra por cámara o dispositivo de captura.",
    )

    sel_zones = st.multiselect(
        "Zona",
        options=zones,
        default=zones,
        key="filter_zones",
        help="Filtra por zona del local.",
    )

    st.markdown("---")

    hour_min, hour_max = st.slider(
        "Rango Horario",
        min_value=0,
        max_value=23,
        value=(7, 23),
        key="filter_hours",
        help="Hora de inicio y fin del análisis (hora local Lima).",
    )

    dow_names = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
    dow_sel = st.multiselect(
        "Días de la semana",
        options=list(range(7)),
        default=list(range(7)),
        format_func=lambda i: dow_names[i],
        key="filter_dow",
    )

    st.markdown("---")

    metric_mode = st.selectbox(
        "Unidad de análisis",
        options=["Eventos", "Personas"],
        index=0,
        key="filter_metric",
        help="'Eventos' cuenta cada registro. 'Personas' agrupa por identificador único.",
    )

    # Valores fijos para compatibilidad con el resto del código
    sel_events = [e for e in events if e in ("enter", "exit", "pasante", "visitor", "visit")]
    align_series = False

    return sel_sites, sel_channels, sel_zones, sel_events, hour_min, hour_max, dow_sel, align_series, metric_mode
