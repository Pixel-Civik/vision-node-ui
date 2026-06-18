-- ============================================================
-- dashboard_filter_options  (versión optimizada — 1 sola pasada)
-- Antes hacía 5 SELECTs separados sobre tracking_logs_view;
-- ahora usa array_agg DISTINCT en un único scan.
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION public.dashboard_filter_options()
RETURNS TABLE(
  sites     text[],
  channels  text[],
  zones     text[],
  min_date  text,
  max_date  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    array_agg(DISTINCT site    ORDER BY site)    FILTER (WHERE site    IS NOT NULL) AS sites,
    array_agg(DISTINCT channel ORDER BY channel) FILTER (WHERE channel IS NOT NULL) AS channels,
    array_agg(DISTINCT zone    ORDER BY zone)    FILTER (WHERE zone    IS NOT NULL) AS zones,
    to_char(MIN(time AT TIME ZONE 'America/Lima'), 'YYYY-MM-DD')                    AS min_date,
    to_char(MAX(time AT TIME ZONE 'America/Lima'), 'YYYY-MM-DD')                    AS max_date
  FROM tracking_logs_view
$$;
