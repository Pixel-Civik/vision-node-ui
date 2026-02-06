from __future__ import annotations

import json
from pathlib import Path

import streamlit as st


@st.cache_data(show_spinner=False)
def load_sample_bytes() -> bytes:
    here = Path(__file__).resolve()
    sample = here.parents[1] / "data" / "tracking_logs.sample.json"
    return sample.read_bytes()


def read_bytes_from_path(path: Path) -> bytes:
    return path.read_bytes()


def load_json_from_bytes(raw: bytes):
    s = raw.decode("utf-8", errors="replace").strip()
    data = json.loads(s)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        if "tracks" in data and isinstance(data.get("tracks"), dict):
            return data
        return data
    raise ValueError("JSON inesperado")

