from __future__ import annotations

import io
from datetime import datetime
from typing import Sequence

import numpy as np
import pandas as pd
import streamlit as st


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fmt_ts(ts) -> str:
    try:
        return ts.tz_convert("America/Lima").strftime("%d/%m/%Y %H:%M")
    except Exception:
        return str(ts)


def _to_lima_str(series: pd.Series) -> pd.Series:
    try:
        return series.dt.tz_convert("America/Lima").dt.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return series.astype(str)


def _safe_cols(df: pd.DataFrame, wanted: list[str]) -> list[str]:
    return [c for c in wanted if c in df.columns]


_RENAMES = {
    "site":        "Sede",
    "channel":     "Cámara",
    "zone_name":   "Zona",
    "event_type":  "Tipo Evento",
    "ts":          "Timestamp (Lima)",
    "track_id":    "ID Persona",
    "gender":      "Género",
    "age":         "Edad",
    "duration_s":  "Duración (s)",
    "local_date":  "Fecha",
    "hour":        "Hora",
    "camera_name": "Nombre Cámara",
}

_DOW_NAMES = {0: "Lunes", 1: "Martes", 2: "Miércoles",
              3: "Jueves", 4: "Viernes", 5: "Sábado", 6: "Domingo"}


# ── Análisis resúmenes ────────────────────────────────────────────────────────

def _resumen_diario(df: pd.DataFrame, event_types: list[str]) -> pd.DataFrame:
    sub = df[df["event_type"].isin(event_types)].copy()
    if sub.empty or "ts" not in sub.columns:
        return pd.DataFrame()
    sub["Fecha"] = sub["ts"].dt.tz_convert("America/Lima").dt.date
    agg = (
        sub.groupby(["Fecha", "event_type"])
        .size()
        .unstack(fill_value=0)
        .reset_index()
    )
    agg.columns.name = None
    return agg


def _por_hora(df: pd.DataFrame, event_types: list[str]) -> pd.DataFrame:
    sub = df[df["event_type"].isin(event_types)].copy()
    if sub.empty or "hour" not in sub.columns:
        return pd.DataFrame()
    agg = (
        sub.groupby(["hour", "event_type"])
        .size()
        .unstack(fill_value=0)
        .reset_index()
    )
    agg.columns.name = None
    agg.rename(columns={"hour": "Hora"}, inplace=True)
    return agg


def _por_dia_semana(df: pd.DataFrame, event_types: list[str]) -> pd.DataFrame:
    sub = df[df["event_type"].isin(event_types)].copy()
    if sub.empty or "dow" not in sub.columns:
        return pd.DataFrame()
    agg = (
        sub.groupby(["dow", "event_type"])
        .size()
        .unstack(fill_value=0)
        .reset_index()
    )
    agg.columns.name = None
    agg["Día"] = agg["dow"].map(_DOW_NAMES)
    agg = agg.drop(columns=["dow"]).set_index("Día")
    return agg.reset_index()


def _conversion_por_hora(df: pd.DataFrame) -> pd.DataFrame:
    sub = df[df["event_type"].isin(["pasante", "enter", "visitor"])].copy()
    if sub.empty or "hour" not in sub.columns:
        return pd.DataFrame()
    pivot = (
        sub.groupby(["hour", "event_type"])
        .size()
        .unstack(fill_value=0)
        .reset_index()
    )
    pivot.columns.name = None
    for col in ["pasante", "enter", "visitor"]:
        if col not in pivot.columns:
            pivot[col] = 0
    pivot["Conv_Enter_%"] = (pivot["enter"] / pivot["pasante"].clip(lower=1) * 100).round(1)
    pivot["Conv_Visitor_%"] = (pivot["visitor"] / pivot["pasante"].clip(lower=1) * 100).round(1)
    pivot.rename(columns={"hour": "Hora", "pasante": "Pasantes",
                           "enter": "Ingresos", "visitor": "Visitantes"}, inplace=True)
    return pivot


def _tiz_por_hora(df: pd.DataFrame) -> pd.DataFrame:
    sub = df[df["event_type"] == "visit"].copy()
    if sub.empty or "hour" not in sub.columns or "duration_s" not in sub.columns:
        return pd.DataFrame()
    sub["duration_s"] = pd.to_numeric(sub["duration_s"], errors="coerce")
    agg = (
        sub.groupby("hour")["duration_s"]
        .agg(Visitas="size", Promedio_s="mean", Mediana_s="median",
             P90_s=lambda x: float(np.percentile(x.dropna(), 90)) if len(x.dropna()) else 0.0)
        .reset_index()
        .round(1)
    )
    agg.rename(columns={"hour": "Hora"}, inplace=True)
    return agg


# ── Excel builder ─────────────────────────────────────────────────────────────

def build_excel(f: pd.DataFrame, ctx: dict, sections: Sequence[str],
                extra: Sequence[str] | None = None) -> bytes:
    extra = extra or []
    buf = io.BytesIO()

    def _prep(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
        out = df[_safe_cols(df, cols)].copy()
        if "ts" in out.columns:
            out["ts"] = _to_lima_str(out["ts"])
        out.rename(columns=_RENAMES, inplace=True)
        return out

    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        # ── Resumen ───────────────────────────────────────────────────────────
        kpi = ctx.get("_kpi", {})
        start_ts = ctx.get("start_ts")
        end_ts   = ctx.get("end_ts")
        summary_rows = [
            ["Parámetro",                  "Valor"],
            ["Período inicio",             _fmt_ts(start_ts) if start_ts else "-"],
            ["Período fin",                _fmt_ts(end_ts)   if end_ts   else "-"],
            ["Total eventos",              str(len(f))],
            ["Entradas (total)",           str(kpi.get("enters", "-"))],
            ["Entradas/día (prom.)",       str(kpi.get("enters_day", "-"))],
            ["Salidas (total)",            str(kpi.get("exits", "-"))],
            ["Salidas/día (prom.)",        str(kpi.get("exits_day", "-"))],
            ["Neto (total)",               str(kpi.get("net", "-"))],
            ["Neto/día (prom.)",           str(kpi.get("net_day", "-"))],
            ["Tasa salida capturada",      f"{kpi.get('exit_rate_pct', '-')}%"],
            ["Generado",                   datetime.now().strftime("%d/%m/%Y %H:%M")],
        ]
        pd.DataFrame(summary_rows[1:], columns=summary_rows[0]).to_excel(
            writer, sheet_name="Resumen", index=False
        )

        # ── Entradas y Salidas ────────────────────────────────────────────────
        if "enter_exit" in sections:
            ee = f[f["event_type"].isin(["enter", "exit"])].copy()
            if not ee.empty:
                _prep(ee, ["site", "channel", "zone_name", "event_type", "ts",
                            "track_id", "gender", "age"]).to_excel(
                    writer, sheet_name="EE_Detalle", index=False
                )
                rd = _resumen_diario(f, ["enter", "exit"])
                if not rd.empty:
                    rd.to_excel(writer, sheet_name="EE_Por_Día", index=False)

        if "enter_exit" in sections and "hourly" in extra:
            ph = _por_hora(f, ["enter", "exit"])
            if not ph.empty:
                ph.to_excel(writer, sheet_name="EE_Por_Hora", index=False)

        if "enter_exit" in sections and "dow" in extra:
            pd_dow = _por_dia_semana(f, ["enter", "exit"])
            if not pd_dow.empty:
                pd_dow.to_excel(writer, sheet_name="EE_Por_Día_Semana", index=False)

        # ── Conversión ────────────────────────────────────────────────────────
        if "conversion" in sections:
            conv = _conversion_por_hora(f)
            if not conv.empty:
                conv.to_excel(writer, sheet_name="Conversión_Por_Hora", index=False)

            rd_pas = _resumen_diario(f, ["pasante", "visitor", "enter"])
            if not rd_pas.empty:
                rd_pas.to_excel(writer, sheet_name="Conv_Por_Día", index=False)

            if "dow" in extra:
                pd_conv = _por_dia_semana(f, ["pasante", "visitor", "enter"])
                if not pd_conv.empty:
                    pd_conv.to_excel(writer, sheet_name="Conv_Por_Día_Semana", index=False)

        # ── Tiempo en Zona ────────────────────────────────────────────────────
        if "tiempo_zona" in sections:
            tiz = f[f["event_type"] == "visit"].copy()
            if not tiz.empty and "duration_s" in tiz.columns:
                _prep(tiz, ["site", "channel", "zone_name", "ts",
                             "duration_s", "track_id"]).to_excel(
                    writer, sheet_name="TIZ_Detalle", index=False
                )
                zone_col = "zone_name" if "zone_name" in tiz.columns else "zone"
                tiz["duration_s"] = pd.to_numeric(tiz["duration_s"], errors="coerce")
                if zone_col in tiz.columns:
                    stats = (
                        tiz.groupby(zone_col)["duration_s"]
                        .agg(
                            Registros="size",
                            Mediana_s="median",
                            Promedio_s="mean",
                            P90_s=lambda x: float(np.percentile(x.dropna(), 90)) if len(x.dropna()) else 0.0,
                        )
                        .reset_index()
                        .round(1)
                    )
                    stats["Mediana_min"] = (stats["Mediana_s"] / 60).round(2)
                    stats["Promedio_min"] = (stats["Promedio_s"] / 60).round(2)
                    stats.rename(columns={zone_col: "Zona"}, inplace=True)
                    stats.to_excel(writer, sheet_name="TIZ_Por_Zona", index=False)

                if "hourly" in extra:
                    th = _tiz_por_hora(f)
                    if not th.empty:
                        th.to_excel(writer, sheet_name="TIZ_Por_Hora", index=False)

                if "dow" in extra:
                    td = _por_dia_semana(f, ["visit"])
                    if not td.empty:
                        td.to_excel(writer, sheet_name="TIZ_Por_Día_Semana", index=False)

    buf.seek(0)
    return buf.getvalue()


# ── PDF builder ───────────────────────────────────────────────────────────────

def build_pdf(f: pd.DataFrame, ctx: dict, sections: Sequence[str], kpi: dict) -> bytes:
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate, Table, TableStyle,
            Paragraph, Spacer, HRFlowable,
        )
    except ImportError:
        st.error("reportlab no está instalado. Ejecuta: pip install reportlab>=4.0")
        return b""

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        rightMargin=2*cm, leftMargin=2*cm,
        topMargin=2.5*cm, bottomMargin=2*cm,
        title="Reporte de Tráfico — Vision Node",
    )

    C = colors.HexColor
    styles = getSampleStyleSheet()
    s_title   = ParagraphStyle("vn_title",   parent=styles["Title"],
                                fontSize=20, spaceAfter=4, textColor=C("#111827"))
    s_h2      = ParagraphStyle("vn_h2",      parent=styles["Heading2"],
                                fontSize=12, spaceBefore=18, spaceAfter=6, textColor=C("#1f2937"))
    s_caption = ParagraphStyle("vn_cap",     parent=styles["Normal"],
                                fontSize=8, spaceAfter=2, textColor=C("#6b7280"))
    s_note    = ParagraphStyle("vn_note",    parent=styles["Normal"],
                                fontSize=8, spaceAfter=6, textColor=C("#92400e"),
                                backColor=C("#fef3c7"), borderPadding=4)

    HR = HRFlowable(width="100%", thickness=0.8, color=C("#e5e7eb"), spaceAfter=4)

    def _tbl(data, col_widths=None):
        t = Table(data, colWidths=col_widths, repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND",     (0, 0), (-1, 0),  C("#1f2937")),
            ("TEXTCOLOR",      (0, 0), (-1, 0),  colors.white),
            ("FONTNAME",       (0, 0), (-1, 0),  "Helvetica-Bold"),
            ("FONTSIZE",       (0, 0), (-1, -1), 8),
            ("ALIGN",          (1, 0), (-1, -1), "CENTER"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [C("#f9fafb"), colors.white]),
            ("GRID",           (0, 0), (-1, -1), 0.4, C("#e5e7eb")),
            ("LEFTPADDING",    (0, 0), (-1, -1), 6),
            ("RIGHTPADDING",   (0, 0), (-1, -1), 6),
            ("TOPPADDING",     (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING",  (0, 0), (-1, -1), 4),
        ]))
        return t

    def _df_tbl(df: pd.DataFrame, max_rows: int = 60):
        df = df.head(max_rows).copy()
        for col in df.select_dtypes(include="float").columns:
            df[col] = df[col].round(2)
        header = [str(c) for c in df.columns]
        rows = [header] + [[str(v) for v in row] for row in df.values]
        avail = 17 * cm
        w = avail / max(1, len(df.columns))
        return _tbl(rows, col_widths=[w] * len(df.columns))

    story = []

    # Portada
    story.append(Paragraph("Reporte de Análisis de Tráfico", s_title))
    story.append(Paragraph(
        f"Vision Node  —  Generado: {datetime.now().strftime('%d/%m/%Y %H:%M')}",
        s_caption,
    ))
    start_ts = ctx.get("start_ts")
    end_ts   = ctx.get("end_ts")
    if start_ts and end_ts:
        story.append(Paragraph(
            f"Período: {_fmt_ts(start_ts)}  →  {_fmt_ts(end_ts)}  (hora Lima)", s_caption,
        ))
    story.append(Spacer(1, 0.3*cm))
    story.append(HR)

    # Resumen ejecutivo
    story.append(Paragraph("Resumen Ejecutivo", s_h2))
    days = kpi.get("days", 1)
    kpi_data = [
        ["Métrica",                   "Promedio / día",         "Total"],
        ["Entradas",                  kpi.get("enters_day","—"), f"{kpi.get('enters','—'):,}" if isinstance(kpi.get('enters'), int) else "—"],
        ["Salidas",                   kpi.get("exits_day","—"),  f"{kpi.get('exits','—'):,}"  if isinstance(kpi.get('exits'),  int) else "—"],
        ["Neto (Entradas − Salidas)", kpi.get("net_day","—"),    f"{kpi.get('net','—'):,}"    if isinstance(kpi.get('net'),    int) else "—"],
        ["Días en período",           "—",                       str(days)],
        ["Tasa salida capturada",     "—",                       f"{kpi.get('exit_rate_pct','—')}%"],
    ]
    story.append(_tbl(kpi_data, col_widths=[9*cm, 4*cm, 4*cm]))
    story.append(Spacer(1, 0.2*cm))
    exit_rate = kpi.get("exit_rate_pct", 100)
    if isinstance(exit_rate, (int, float)) and exit_rate < 80:
        story.append(Paragraph(
            f"⚠ Tasa de salida: {exit_rate}% (< 80%). Revisar cobertura de sensores.", s_note,
        ))

    # Entradas y Salidas
    if "enter_exit" in sections:
        rd = _resumen_diario(f, ["enter", "exit"])
        if not rd.empty:
            story.append(Paragraph("Entradas y Salidas — Por Día", s_h2))
            story.append(_df_tbl(rd))
            story.append(Spacer(1, 0.2*cm))

        ph = _por_hora(f, ["enter", "exit"])
        if not ph.empty:
            story.append(Paragraph("Entradas y Salidas — Promedio por Hora", s_h2))
            story.append(_df_tbl(ph))

    # Conversión
    if "conversion" in sections:
        story.append(Paragraph("Conversión — Pasantes vs Ingresos por Hora", s_h2))
        story.append(Paragraph(
            "Conv_Enter_%: porcentaje de pasantes que ingresaron al local. "
            "Conv_Visitor_%: porcentaje de pasantes detectados en zona de recepción.",
            s_caption,
        ))
        conv = _conversion_por_hora(f)
        if not conv.empty:
            story.append(_df_tbl(conv))
            story.append(Spacer(1, 0.2*cm))

        rd_conv = _resumen_diario(f, ["pasante", "visitor", "enter"])
        if not rd_conv.empty:
            story.append(Paragraph("Pasantes / Visitantes / Ingresos — Por Día", s_h2))
            story.append(_df_tbl(rd_conv))

    # Tiempo en Zona
    if "tiempo_zona" in sections:
        tiz = f[f["event_type"] == "visit"].copy()
        if not tiz.empty and "duration_s" in tiz.columns:
            story.append(Paragraph("Tiempo en Zona — Estadísticas", s_h2))
            zone_col = "zone_name" if "zone_name" in tiz.columns else "zone"
            tiz["duration_s"] = pd.to_numeric(tiz["duration_s"], errors="coerce")
            if zone_col in tiz.columns:
                stats = (
                    tiz.groupby(zone_col)["duration_s"]
                    .agg(
                        Registros="size",
                        Mediana_s="median",
                        Promedio_s="mean",
                        P90_s=lambda x: float(np.percentile(x.dropna(), 90)) if len(x.dropna()) else 0.0,
                    )
                    .reset_index()
                    .round(1)
                )
                stats["Mediana_min"] = (stats["Mediana_s"] / 60).round(2)
                stats.rename(columns={zone_col: "Zona"}, inplace=True)
                story.append(_df_tbl(stats))

            th = _tiz_por_hora(f)
            if not th.empty:
                story.append(Paragraph("Tiempo en Zona — Por Hora", s_h2))
                story.append(_df_tbl(th))

    doc.build(story)
    buf.seek(0)
    return buf.getvalue()


# ── Vista previa dentro del dialog ───────────────────────────────────────────

def _render_preview(f: pd.DataFrame, kpi: dict, sections: list[str]) -> None:
    days = kpi.get("days", 1)
    enters = kpi.get("enters", 0)
    exits  = kpi.get("exits", 0)
    net    = kpi.get("net", 0)

    st.markdown("**Resumen del período**")
    c1, c2, c3 = st.columns(3)
    c1.metric("Entradas/día", f"{enters / max(1, days):.1f}", f"Total {enters:,}", delta_color="off")
    c2.metric("Salidas/día",  f"{exits  / max(1, days):.1f}", f"Total {exits:,}",  delta_color="off")
    c3.metric("Neto/día",     f"{net    / max(1, days):.1f}", f"Total {net:,}",    delta_color="off")

    st.divider()
    st.markdown("**Tablas incluidas en el reporte:**")

    if "enter_exit" in sections:
        rd = _resumen_diario(f, ["enter", "exit"])
        if not rd.empty:
            st.caption("Entradas y Salidas por día")
            st.dataframe(rd.head(7), use_container_width=True, hide_index=True)

    if "conversion" in sections:
        conv = _conversion_por_hora(f)
        if not conv.empty:
            st.caption("Conversión por hora (pasante → ingreso)")
            st.dataframe(conv, use_container_width=True, hide_index=True)

    if "tiempo_zona" in sections:
        tiz = f[f["event_type"] == "visit"].copy()
        if not tiz.empty and "duration_s" in tiz.columns:
            zone_col = "zone_name" if "zone_name" in tiz.columns else "zone"
            tiz["duration_s"] = pd.to_numeric(tiz["duration_s"], errors="coerce")
            if zone_col in tiz.columns:
                stats = (
                    tiz.groupby(zone_col)["duration_s"]
                    .agg(Registros="size", Mediana_s="median", Promedio_s="mean")
                    .reset_index().round(1)
                )
                stats.rename(columns={zone_col: "Zona"}, inplace=True)
                st.caption("Tiempo en Zona — estadísticas por zona")
                st.dataframe(stats, use_container_width=True, hide_index=True)


# ── Dialog principal ──────────────────────────────────────────────────────────

@st.dialog("Exportar Reporte", width="large")
def _export_dialog(f: pd.DataFrame, ctx: dict, kpi: dict) -> None:
    st.caption(
        f"Período: **{_fmt_ts(ctx['start_ts'])}** → **{_fmt_ts(ctx['end_ts'])}**  ·  "
        f"**{len(f):,}** eventos en la selección actual"
    )

    tab_opts, tab_prev = st.tabs(["Opciones de exportación", "Vista previa"])

    # ── Tab: Opciones ─────────────────────────────────────────────────────────
    with tab_opts:
        has_ee   = not f[f["event_type"].isin(["enter", "exit"])].empty
        has_conv = not f[f["event_type"].isin(["pasante", "visitor", "enter"])].empty
        has_tiz  = not f[f["event_type"] == "visit"].empty

        col_sec, col_extra = st.columns([1, 1])

        with col_sec:
            st.markdown("**¿Qué incluir?**")
            inc_ee   = st.checkbox("Entradas y Salidas",          value=has_ee,   disabled=not has_ee,   key="_exp_ee")
            inc_conv = st.checkbox("Conversión Pasantes → Ingreso", value=has_conv, disabled=not has_conv, key="_exp_conv")
            inc_tiz  = st.checkbox("Tiempo en Zona",              value=has_tiz,  disabled=not has_tiz,  key="_exp_tiz")

        with col_extra:
            st.markdown("**Análisis adicional (Excel)**")
            inc_hourly = st.checkbox("Desglose por hora",       value=True,  key="_exp_hourly",
                                     help="Agrega hojas con totales por hora del día.")
            inc_dow    = st.checkbox("Desglose por día de semana", value=False, key="_exp_dow",
                                     help="Agrega hojas con promedios por Lunes-Domingo.")

        sections: list[str] = (
            (["enter_exit"]  if inc_ee   else []) +
            (["conversion"]  if inc_conv else []) +
            (["tiempo_zona"] if inc_tiz  else [])
        )
        extra: list[str] = (
            (["hourly"] if inc_hourly else []) +
            (["dow"]    if inc_dow    else [])
        )

        if not sections:
            st.warning("Selecciona al menos una sección.")
        else:
            fname = datetime.now().strftime("%Y%m%d_%H%M")
            ctx_with_kpi = {**ctx, "_kpi": kpi}

            st.divider()
            c_xl, c_pdf = st.columns(2)

            with c_xl:
                st.markdown("**Excel** — tablas detalladas + análisis por hora/día")
                try:
                    xl = build_excel(f, ctx_with_kpi, sections, extra)
                    st.download_button(
                        "Descargar Excel",
                        data=xl,
                        file_name=f"vision_node_{fname}.xlsx",
                        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        icon=":material/table:",
                        use_container_width=True,
                        key="_dl_xl",
                    )
                except Exception as e:
                    st.error(f"Error generando Excel: {e}")

            with c_pdf:
                st.markdown("**PDF** — reporte ejecutivo con tablas de resumen")
                try:
                    pdf = build_pdf(f, ctx, sections, kpi)
                    if pdf:
                        st.download_button(
                            "Descargar PDF",
                            data=pdf,
                            file_name=f"vision_node_{fname}.pdf",
                            mime="application/pdf",
                            icon=":material/description:",
                            use_container_width=True,
                            key="_dl_pdf",
                        )
                except Exception as e:
                    st.error(f"Error generando PDF: {e}")

            st.caption(
                "El Excel incluye una hoja **Resumen** con los KPIs del período, "
                "más hojas separadas por sección seleccionada. "
                "El PDF es un documento ejecutivo con tablas de resumen (sin gráficos)."
            )

    # ── Tab: Vista previa ─────────────────────────────────────────────────────
    with tab_prev:
        _render_preview(f, kpi, sections if sections else ["enter_exit", "conversion", "tiempo_zona"])


# ── Punto de entrada público ──────────────────────────────────────────────────

def render_export_panel(f: pd.DataFrame, ctx: dict, kpi: dict) -> None:
    if st.button("Exportar reporte", icon=":material/download:", use_container_width=True):
        _export_dialog(f, ctx, kpi)
