import streamlit as st

def render_metrics(f):
    enters = int((f["event_type"] == "enter").sum())
    exits = int((f["event_type"] == "exit").sum())
    net = enters - exits
    tracks = f["track_id"].dropna().nunique()
    total_ev = int(len(f))
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Total Entradas", f"{enters}")
    c2.metric("Total Salidas", f"{exits}")
    c3.metric("Balance Neto", f"{net}")
    c4.metric("Identificadores Únicos", f"{int(tracks)}")
    return enters, exits, total_ev
