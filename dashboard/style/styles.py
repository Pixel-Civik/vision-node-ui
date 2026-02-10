import streamlit as st

def inject_css() -> None:
    st.markdown(
        """
    <style>
      /* Contenedor principal - ancho completo y limpio */
      .block-container {
        padding-top: 1rem;
        padding-bottom: 2rem;
        max-width: 100% !important;
      }

      /* Tipografía profesional */
      h1, h2, h3 { 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-weight: 500;
        color: #1a1a1a;
        letter-spacing: -0.01em;
      }

      h1 { font-size: 1.8rem; }
      h2 { font-size: 1.4rem; }
      h3 { font-size: 1.2rem; }

      /* Sidebar minimalista */
      .css-1d391kg {
        background-color: #ffffff;
        border-right: 1px solid #e0e0e0;
      }

      /* Botones formales */
      .stButton > button {
        background: #2563eb;
        border: 1px solid #1d4ed8;
        color: white;
        border-radius: 4px;
        padding: 0.5rem 1rem;
        font-weight: 400;
        font-size: 0.9rem;
        transition: background-color 0.2s ease;
      }

      .stButton > button:hover {
        background: #1d4ed8;
        border-color: #1e40af;
      }

      /* Selectores formales */
      .stSelectbox > div > div,
      .stMultiSelect > div > div {
        border-radius: 4px;
        border: 1px solid #d1d5db;
        background: white;
      }

      /* Métricas formales */
      .stMetric {
        background: transparent;
        border: none;
        border-radius: 0;
        padding: 0.25rem 0;
      }

      .stMetric label {
        color: #4b5563;
        font-size: 0.8rem;
        font-weight: 400;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      /* Tooltips discretos */
      .stTooltip {
        background: #1f2937 !important;
        color: white !important;
        border-radius: 4px !important;
        font-size: 0.8rem !important;
        font-weight: 400 !important;
      }

      /* Scrollbar profesional */
      ::-webkit-scrollbar {
        width: 6px;
      }

      ::-.webkit-scrollbar-track {
        background: #f3f4f6;
      }

      ::-webkit-scrollbar-thumb {
        background: #9ca3af;
        border-radius: 3px;
      }

      ::-webkit-scrollbar-thumb:hover {
        background: #6b7280;
      }

      /* Gráficas formales */
      .vega-embed {
        background: transparent;
        border-radius: 0;
        border: none;
        margin: 0.25rem 0;
      }

      /* Footer profesional */
      .muted {
        color: #6b7280;
        font-size: 0.8rem;
        font-weight: 400;
        margin-top: 2rem;
        padding-top: 1rem;
        border-top: 1px solid #e5e7eb;
      }
    </style>
    """,
        unsafe_allow_html=True,
    )

def inject_styles() -> None:
    inject_css()
