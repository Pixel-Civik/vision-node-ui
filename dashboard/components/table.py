import streamlit as st
import pandas as pd

def render_table(f: pd.DataFrame):
    show_cols = [c for c in ["ts", "site", "channel", "event_type", "zone_name", "track_id", "gender", "age", "format"] if c in f.columns]
    out = f.sort_values("ts", ascending=False)[show_cols].copy()
    st.dataframe(out, use_container_width=True, height=520)
