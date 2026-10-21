-- ============================================================================
-- alert_log · promovido desde supabase/functions/alert_log.sql
-- ============================================================================
-- Ninguna migración creaba esta tabla: solo existía como archivo suelto para
-- pegar en el SQL Editor. Un proyecto nuevo levantado desde migrations/ se
-- quedaba sin ella, y la Edge Function check-freshness fallaba al registrar
-- alertas. Contenido idéntico al original; solo se añade RLS y el reload.
-- ============================================================================

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

-- Columna que existe en produccion y que functions/alert_log.sql no tenia.
-- [PROBADO] introspeccion GraphQL: alert_log.last_notified_at es NON_NULL.
-- Ninguna migracion la anade (las otras apariciones de last_notified_at son
-- sobre edge_node_alerts). Sin esto, la Edge Function check-freshness falla al
-- escribirla en un proyecto nuevo.
-- [INFERIDO] el default now(): necesario para que NOT NULL sea aplicable.
alter table public.alert_log
  add column if not exists last_notified_at timestamptz not null default now();

alter table public.alert_log enable row level security;

notify pgrst, 'reload schema';
