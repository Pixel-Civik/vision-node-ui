from __future__ import annotations

import pandas as pd


def _to_dt(s: pd.Series) -> pd.Series:
    if s is None:
        return pd.Series([], dtype="datetime64[ns, UTC]")
    out = pd.to_datetime(s, errors="coerce", utc=True)
    if out.isna().any():
        try:
            from datetime import datetime
        except Exception:
            return out
        mask = out.isna() & s.notna()
        if mask.any():
            def parse_one(v):
                if v is None:
                    return pd.NaT
                t = str(v).strip()
                if not t:
                    return pd.NaT
                t = t.replace("Z", "+00:00")
                try:
                    dt = datetime.fromisoformat(t)
                    if dt.tzinfo is None:
                        return pd.Timestamp(dt, tz="UTC")
                    return pd.Timestamp(dt).tz_convert("UTC")
                except Exception:
                    return pd.NaT
            fixed = s[mask].map(parse_one)
            out.loc[mask] = fixed
    return out


def normalize_events(data) -> pd.DataFrame:
    if isinstance(data, dict) and "tracks" in data:
        return pd.DataFrame()

    if not isinstance(data, list):
        return pd.DataFrame()

    if not data:
        return pd.DataFrame()

    first = data[0] if isinstance(data[0], dict) else {}
    keys = set(first.keys())

    if "event" in keys and "time" in keys:
        df = pd.DataFrame(data)
        df["event_type"] = df.get("event")
        df["zone_name"] = df.get("zone")
        df["ts"] = _to_dt(df.get("time"))
        df["ts_start"] = pd.NaT
        df["ts_end"] = pd.NaT
        df["duration_s"] = pd.NA
        df["format"] = "global"
        cols = [
            "format",
            "site",
            "channel",
            "event_type",
            "zone_name",
            "ts",
            "track_id",
            "gender",
            "age",
            "time",
            "event",
            "zone",
        ]
        for c in cols:
            if c not in df.columns:
                df[c] = pd.NA
        df["track_id"] = pd.to_numeric(df["track_id"], errors="coerce")
        df["age"] = pd.to_numeric(df["age"], errors="coerce")
        return df[cols]

    if "event_type" in keys and "time" in keys:
        df = pd.DataFrame(data)
        df["zone_name"] = df.get("zone_name")
        df["ts"] = _to_dt(df.get("time"))
        df["ts_start"] = pd.NaT
        df["ts_end"] = pd.NaT
        df["duration_s"] = pd.NA
        df["format"] = "per_video"
        cols = [
            "format",
            "site",
            "channel",
            "event_type",
            "zone_name",
            "ts",
            "track_id",
            "gender",
            "age",
            "time",
        ]
        for c in cols:
            if c not in df.columns:
                df[c] = pd.NA
        df["track_id"] = pd.to_numeric(df["track_id"], errors="coerce")
        df["age"] = pd.to_numeric(df["age"], errors="coerce")
        return df[cols]

    if "event_type" in keys and "time_start" in keys and "time_end" in keys:
        df = pd.DataFrame(data)
        df["event_type"] = df.get("event_type")
        df["zone_name"] = df.get("zone_name")
        df["ts_start"] = _to_dt(df.get("time_start"))
        df["ts_end"] = _to_dt(df.get("time_end"))
        df["ts"] = df["ts_start"]
        df["duration_s"] = (df["ts_end"] - df["ts_start"]).dt.total_seconds()
        df["format"] = "presence"
        cols = [
            "format",
            "site",
            "channel",
            "event_type",
            "zone_name",
            "ts",
            "ts_start",
            "ts_end",
            "duration_s",
            "track_id",
            "time_start",
            "time_end",
        ]
        for c in cols:
            if c not in df.columns:
                df[c] = pd.NA
        return df[cols]

    df = pd.DataFrame(data)
    df["ts"] = _to_dt(df.get("time"))
    df["format"] = "unknown"
    return df
