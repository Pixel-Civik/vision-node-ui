from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import altair as alt
import pandas as pd
import os
import streamlit as st
from dotenv import load_dotenv

# Cargar .env explícitamente desde la carpeta del script
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(env_path)

from dashboard.data import load_json_from_bytes, load_from_supabase, supabase_rpc
from dashboard.normalize import normalize_events
from dashboard.views.present import render_dashboard
from dashboard.style.styles import inject_styles


@dataclass(frozen=True)
class DataSource:
    kind: str
    label: str


SOURCES = [
    DataSource("supabase", "Supabase"),
]


import warnings
warnings.simplefilter(action='ignore', category=FutureWarning)

def main() -> None:
    st.set_page_config(page_title="Vision Node Dashboard", layout="wide")
    alt.data_transformers.disable_max_rows()
    inject_styles()

    # Header formal y ejecutivo
    col1, col2 = st.columns([3, 1])
    with col1:
        st.title("Dashboard de Análisis de Tráfico")
        st.markdown("Análisis de entradas y salidas en tiempo real")
        st.caption("Visualización de patrones de comportamiento y métricas de tráfico")
    with col2:
        st.metric("Estado del Sistema", "Activo", "Conectado")

    with st.sidebar:
        raw_bytes: bytes | None = None
        source_name = ""

        sb_url_env = os.getenv("SUPABASE_URL", "")
        sb_key_env = os.getenv("SUPABASE_ANON_KEY", "") or os.getenv("SUPABASE_KEY", "")
        sb_url = sb_url_env
        sb_key = sb_key_env

        if not sb_url:
            sb_url = st.text_input("SUPABASE_URL", value="", placeholder="https://xxxx.supabase.co")
        if not sb_key:
            sb_key = st.text_input("Clave Supabase", value="", type="password")

        if (sb_url and sb_key) or (sb_url_env and sb_key_env):
            try:
                with st.status("Cargando datos...", expanded=False) as _status:
                    _status.update(label="Conectando a Supabase...")
                    rows2 = load_from_supabase(
                        sb_url,
                        sb_key,
                        view="tracking_logs_view",
                        max_rows=200000,
                    )
                    _status.update(
                        label=f"✓ {len(rows2):,} eventos cargados",
                        state="complete",
                        expanded=False,
                    )
                raw_bytes = json.dumps(rows2, ensure_ascii=False).encode("utf-8")
                source_name = "supabase://tracking_logs_view"
            except Exception as e:
                st.error(f"Error al conectar: {e}")

        if st.button("Actualizar datos", type="secondary"):
            try:
                load_from_supabase.clear()
                supabase_rpc.clear()
                st.rerun()
            except Exception:
                pass

        st.divider()

    if raw_bytes is None:
        st.info("Selecciona una fuente y carga el JSON.")
        return

    try:
        rows = load_json_from_bytes(raw_bytes)
    except json.JSONDecodeError as e:
        st.error(f"JSON inválido: {e}")
        return
    except Exception as e:
        st.error(f"No se pudo leer el JSON: {e}")
        return

    df_raw = normalize_events(rows)
    if df_raw.empty:
        st.warning("No se encontraron eventos reconocibles en el JSON.")
        st.write(rows[:5] if isinstance(rows, list) else rows)
        return

    render_dashboard(df_raw=df_raw, source_name=source_name)


if __name__ == "__main__":
    main()
