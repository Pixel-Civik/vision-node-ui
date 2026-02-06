from __future__ import annotations

import streamlit as st


def inject_styles() -> None:
    css = """
    <style>
      .block-container { padding-top: 1.2rem; padding-bottom: 2rem; }

      h1, h2, h3 { letter-spacing: -0.02em; }

      .kpi-label {
        color: rgba(27, 31, 42, 0.65);
        font-weight: 600;
        font-size: 0.92rem;
        margin-bottom: 0.15rem;
      }

      .kpi-value {
        font-weight: 800;
        font-size: 1.8rem;
        line-height: 1.1;
        margin: 0;
      }

      .kpi-sub {
        color: rgba(27, 31, 42, 0.60);
        font-size: 0.85rem;
        margin-top: 0.25rem;
      }

      .section-title {
        font-weight: 800;
        font-size: 1.05rem;
        margin: 0 0 0.4rem 0;
      }

      .muted {
        color: rgba(27, 31, 42, 0.60);
      }

      div[data-testid="stMetric"] {
        background: transparent;
        border: 0;
        padding: 0;
      }

      div[data-testid="stSidebar"] {
        border-right: 1px solid rgba(25, 33, 46, 0.08);
      }
    </style>
    """
    st.markdown(css, unsafe_allow_html=True)
