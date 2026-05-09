import pandas as pd
import streamlit as st

from .time_in_zone import render_time_in_zone
from .facade_compare import render_facade_compare


def render_traffic(f: pd.DataFrame, ctx: dict) -> None:
    st.subheader("Visitantes y Zonas")

    tabs = [
        ("Tiempo en zona", lambda: render_time_in_zone(f, ctx)),
        ("Pasantes vs Visitantes", lambda: render_facade_compare(f, ctx)),
    ]

    rendered = st.tabs([t[0] for t in tabs])
    with rendered[0]:
        render_time_in_zone(f, ctx)
    with rendered[1]:
        render_facade_compare(f, ctx)
