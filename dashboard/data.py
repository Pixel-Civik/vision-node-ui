from __future__ import annotations

import json
from pathlib import Path

import streamlit as st
from azure.storage.blob import BlobServiceClient
import os
from dotenv import load_dotenv

load_dotenv()


@st.cache_data(show_spinner=False, ttl=60)
def load_from_azure(conn_str: str, container: str, blob_name: str) -> bytes:
    if not conn_str or not container or not blob_name:
        raise ValueError("Faltan credenciales/config de Azure")
    try:
        service = BlobServiceClient.from_connection_string(conn_str)
        cc = service.get_container_client(container)
        blob = cc.get_blob_client(blob_name)
        return blob.download_blob().readall()
    except Exception as e:
        raise RuntimeError(f"Azure error: {e}")



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

