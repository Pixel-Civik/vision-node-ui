import pandas as pd
import streamlit as st

from .time_in_zone import render_time_in_zone
from .entrances import render_entrances
from .visitors import render_visitors
from .facade_compare import render_facade_compare


def render_traffic(f: pd.DataFrame, ctx: dict) -> None:
    st.subheader("Visitantes y Zonas")

    tabs = [
        ("Tiempo en zona", lambda: render_time_in_zone(f, ctx)),
        ("Visitantes (ingreso tienda)", lambda: render_entrances(f, ctx)),
        ("Pasantes vs Visitantes", lambda: render_facade_compare(ctx)),
    ]

    rendered = st.tabs([t[0] for t in tabs])
    with rendered[0]:
        render_time_in_zone(f, ctx)
    with rendered[1]:
        render_entrances(f, ctx)
    with rendered[2]:
        render_facade_compare(ctx)
