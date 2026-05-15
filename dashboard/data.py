from __future__ import annotations

import json
from pathlib import Path

import streamlit as st
import os
from dotenv import load_dotenv
import requests

load_dotenv()


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


@st.cache_data(show_spinner="Descargando eventos desde Supabase...", ttl=60)
def load_from_supabase(
    sb_url: str,
    sb_key: str,
    *,
    view: str = "tracking_logs_view",
    site: str | None = None,
    since_iso: str | None = None,
    until_iso: str | None = None,
    max_rows: int = 50000,
    page_size: int = 10000,
) -> list[dict]:
    sb_url = str(sb_url or "").replace("`", "").replace("\"", "").replace("'", "").strip().rstrip("/")
    sb_key = str(sb_key or "").replace("`", "").replace("\"", "").replace("'", "").strip()
    if not sb_url or not sb_key:
        raise ValueError("Faltan credenciales/config de Supabase (SUPABASE_URL/SUPABASE_KEY)")

    base = f"{sb_url}/rest/v1/{str(view).strip()}"
    headers = {
        "apikey": sb_key,
        "Authorization": f"Bearer {sb_key}",
        "Accept": "application/json",
    }

    cols = [
        "site",
        "channel",
        "camera_name",
        "event",
        "zone",
        "time",
        "track_id",
        "gender",
        "age",
        "dwell_sec",
        "time_enter",
        "time_end",
        "clip_url",
    ]

    out: list[dict] = []
    offset = 0
    while offset < int(max_rows):
        requested = int(min(page_size, max_rows - offset))
        params: list[tuple[str, str]] = [
            ("select", ",".join(cols)),
            ("order", "time.asc"),
            ("limit", str(requested)),
            ("offset", str(int(offset))),
        ]
        if site:
            params.append(("site", f"eq.{site}"))
        if since_iso:
            params.append(("time", f"gte.{since_iso}"))
        if until_iso:
            params.append(("time", f"lt.{until_iso}"))

        r = requests.get(base, headers=headers, params=params, timeout=60)
        r.raise_for_status()
        batch = r.json()
        if not isinstance(batch, list):
            break
        batch = [x for x in batch if isinstance(x, dict)]
        batch_n = len(batch)
        if batch_n == 0:
            break
        out.extend(batch)
        offset += batch_n

    return out


@st.cache_data(show_spinner="Consultando métricas...", ttl=60)
def supabase_rpc(sb_url: str, sb_key: str, fn: str, payload: dict) -> list[dict]:
    sb_url = str(sb_url or "").replace("`", "").replace("\"", "").replace("'", "").strip().rstrip("/")
    sb_key = str(sb_key or "").replace("`", "").replace("\"", "").replace("'", "").strip()
    if not sb_url or not sb_key:
        raise ValueError("Faltan credenciales/config de Supabase (SUPABASE_URL/SUPABASE_KEY)")
    url = f"{sb_url}/rest/v1/rpc/{str(fn).strip()}"
    headers = {
        "apikey": sb_key,
        "Authorization": f"Bearer {sb_key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    r = requests.post(url, headers=headers, json=(payload or {}), timeout=60)
    if r.status_code in (400, 404):
        return []   # RPC no existe — degradar silenciosamente
    r.raise_for_status()
    data = r.json()
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    return []
