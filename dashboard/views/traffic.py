import pandas as pd
import streamlit as st

from .time_in_zone import render_time_in_zone
from .entrances import render_entrances
from .visitors import render_visitors
from .store_visitors import render_store_visitors


def render_traffic(f: pd.DataFrame) -> None:
    st.subheader("Visitantes y Zonas")

    has_pasantes = bool((f.get("event_type") == "pasante").any()) if "event_type" in f.columns else False
    has_visits = bool((f.get("event_type") == "visit").any()) if "event_type" in f.columns else False
    has_enters = bool((f.get("event_type") == "enter").any()) if "event_type" in f.columns else False
    has_visitors = bool((f.get("event_type") == "visitor").any()) if "event_type" in f.columns else False

    if not has_pasantes and not has_visits and not has_enters and not has_visitors:
        st.info("No hay datos de entradas, visitantes, pasantes ni de tiempo en zona (visit) con los filtros seleccionados.")
        st.caption("Tip: para ver zonas como “Lacteos y embutidos”, selecciona Tipo de Evento = visit y el canal correspondiente (p.ej. 1401).")
        return

    tabs = [
        ("Tiempo en zona", lambda: render_time_in_zone(f)),
        ("Entradas (tienda)", lambda: render_entrances(f)),
        ("Visitantes (fachada)", lambda: render_store_visitors(f)),
        ("Pasantes", lambda: render_visitors(f)),
    ]

    rendered = st.tabs([t[0] for t in tabs])
    with rendered[0]:
        if not has_visits:
            st.info("No hay eventos de tiempo en zona (visit) con los filtros actuales.")
            st.caption("Tip: marca Tipo de Evento = visit y revisa canal/periodo para ver zonas internas como “Lacteos y embutidos”.")
        render_time_in_zone(f)
    with rendered[1]:
        render_entrances(f)
    with rendered[2]:
        render_visitors(f)
