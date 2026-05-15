import streamlit as st


_CSS = """
<style>
  /* Contenedor principal */
  .block-container {
    padding-top: 1rem;
    padding-bottom: 2rem;
    max-width: 100% !important;
  }

  /* Tipografía */
  h1, h2, h3 {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-weight: 500;
    color: #1a1a1a;
    letter-spacing: -0.01em;
  }
  h1 { font-size: 1.8rem; }
  h2 { font-size: 1.4rem; }
  h3 { font-size: 1.2rem; }

  /* Sidebar */
  .css-1d391kg {
    background-color: #ffffff;
    border-right: 1px solid #e0e0e0;
  }

  /* Botones */
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

  /* Selectores */
  .stSelectbox > div > div,
  .stMultiSelect > div > div {
    border-radius: 4px;
    border: 1px solid #d1d5db;
    background: white;
  }

  /* ── KPI Cards ──────────────────────────────────────────────── */
  [data-testid="metric-container"] {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem 1.2rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  }

  [data-testid="metric-container"] label {
    color: #6b7280;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Oculta la flecha del delta cuando delta_color="off" */
  [data-testid="stMetricDelta"] svg {
    display: none;
  }

  /* Tooltips */
  .stTooltip {
    background: #1f2937 !important;
    color: white !important;
    border-radius: 4px !important;
    font-size: 0.8rem !important;
    font-weight: 400 !important;
  }

  /* Métricas base (fuera de cards) */
  .stMetric label {
    color: #4b5563;
    font-size: 0.8rem;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Gráficas */
  .vega-embed {
    background: transparent;
    border-radius: 0;
    border: none;
    margin: 0.25rem 0;
  }

  /* Separadores */
  hr {
    border: none;
    border-top: 1px solid #e5e7eb;
    margin: 1.5rem 0;
  }

  /* Scrollbar */
  ::-webkit-scrollbar        { width: 6px; }
  ::-webkit-scrollbar-track  { background: #f3f4f6; }
  ::-webkit-scrollbar-thumb  { background: #9ca3af; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #6b7280; }

  /* Texto auxiliar */
  .stCaption {
    color: #6b7280;
    font-size: 0.8rem;
    font-style: italic;
  }

  /* Expanders */
  .streamlit-expanderHeader {
    background-color: #f9fafb;
    border-radius: 4px;
    border: 1px solid #e5e7eb;
    font-weight: 500;
    color: #1f2937;
  }
  .streamlit-expanderContent {
    border-radius: 0 0 4px 4px;
    border: 1px solid #e5e7eb;
    border-top: none;
    background: white;
  }

  /* Inputs de fecha/hora */
  .stDateInput input,
  .stTimeInput input {
    border-radius: 4px;
    border: 1px solid #d1d5db;
    background: white;
    font-family: inherit;
  }

  /* ── Skeleton loader ───────────────────────────────────────────── */
  @keyframes skeleton-pulse {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .skeleton-card {
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: skeleton-pulse 1.4s ease infinite;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
  }

  .skeleton-metric {
    height: 88px;
  }

  .skeleton-chart {
    height: 280px;
    margin-top: 0.5rem;
  }

  .skeleton-line {
    height: 16px;
    border-radius: 4px;
    margin-bottom: 0.5rem;
  }

  .skeleton-line.short { width: 40%; }
  .skeleton-line.medium { width: 70%; }
  .skeleton-line.full { width: 100%; }
</style>
"""


def inject_css() -> None:
    st.markdown(_CSS, unsafe_allow_html=True)


def inject_styles() -> None:
    inject_css()


def skeleton_metrics(n: int = 3) -> None:
    """Renders n skeleton KPI card placeholders."""
    cols = st.columns(n)
    for col in cols:
        col.markdown('<div class="skeleton-card skeleton-metric"></div>', unsafe_allow_html=True)
    st.markdown('<div class="skeleton-card skeleton-line short" style="margin-top:0.5rem"></div>', unsafe_allow_html=True)


def skeleton_chart(height_class: str = "skeleton-chart") -> None:
    """Renders a skeleton chart placeholder."""
    st.markdown(f'<div class="skeleton-card {height_class}"></div>', unsafe_allow_html=True)
