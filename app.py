from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import altair as alt
import pandas as pd
import requests
import streamlit as st

from dashboard.data import load_json_from_bytes, load_sample_bytes, read_bytes_from_path
from dashboard.normalize import normalize_events
from dashboard.present import render_dashboard
from dashboard.styles import inject_styles


@dataclass(frozen=True)
class DataSource:
    kind: str
    label: str


SOURCES = [
    DataSource("sample", "Ejemplo (incluido)"),
    DataSource("upload", "Subir archivo JSON"),
    DataSource("path", "Ruta local (servidor)"),
    DataSource("url", "URL (SAS/publica)"),
]


def main() -> None:
    st.set_page_config(page_title="Vision Node Dashboard", layout="wide")
    alt.data_transformers.disable_max_rows()
    inject_styles()

    st.title("Dashboard de Eventos")
    st.caption("Vista tipo PowerBI para eventos enter/exit (y presence si aplica).")

    with st.sidebar:
        st.subheader("Fuente de datos")
        src = st.radio(
            "Elegir",
            options=[s.kind for s in SOURCES],
            format_func=lambda k: next(s.label for s in SOURCES if s.kind == k),
            label_visibility="collapsed",
        )

        raw_bytes: bytes | None = None
        source_name = ""

        if src == "sample":
            raw_bytes = load_sample_bytes()
            source_name = "sample"

        if src == "upload":
            up = st.file_uploader("JSON", type=["json"])
            if up is not None:
                raw_bytes = up.read()
                source_name = up.name

        if src == "path":
            default_path = str(Path(__file__).resolve().parents[1] / "server" / "examples" / "tracking_logs.sample.json")
            path_str = st.text_input("Ruta al JSON", value=default_path)
            if path_str.strip():
                try:
                    raw_bytes = read_bytes_from_path(Path(path_str))
                    source_name = path_str
                except Exception as e:
                    st.error(f"No se pudo leer la ruta: {e}")

        if src == "url":
            url = st.text_input("URL (SAS o pública)")
            headers = {}
            token = st.text_input("Bearer (opcional)", type="password")
            if token.strip():
                headers["Authorization"] = f"Bearer {token.strip()}"
            if url.strip():
                try:
                    r = requests.get(url.strip(), headers=headers, timeout=30)
                    r.raise_for_status()
                    raw_bytes = r.content
                    source_name = url.strip()
                except Exception as e:
                    st.error(f"No se pudo descargar la URL: {e}")

        st.divider()
        st.subheader("Filtros")
        st.caption("Los filtros aparecen cuando el JSON se carga correctamente.")

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
