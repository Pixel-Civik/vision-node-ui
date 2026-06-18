-- ============================================================
-- 1. Tabla alert_log
-- Evita enviar correos duplicados por el mismo período de silencio.
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.alert_log (
  id            serial      PRIMARY KEY,
  alert_type    text        NOT NULL DEFAULT 'data_stale',
  sent_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz,          -- NULL = alerta activa
  minutes_stale int
);

-- Índice para que la Edge Function encuentre la alerta abierta rápido
CREATE INDEX IF NOT EXISTS alert_log_open_idx
  ON public.alert_log (alert_type, resolved_at)
  WHERE resolved_at IS NULL;
