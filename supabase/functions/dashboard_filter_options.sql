-- ============================================================
-- dashboard_filter_options
-- Reemplaza las 3 queries sin LIMIT en fetchFilterOptions.
-- Devuelve una sola fila con arrays de valores únicos + rango de fechas.
-- ============================================================

CREATE OR REPLACE FUNCTION dashboard_filter_options()
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
    ARRAY(
      SELECT DISTINCT site FROM tracking_logs_view
      WHERE site IS NOT NULL ORDER BY 1
    )                                                                   AS sites,
    ARRAY(
      SELECT DISTINCT channel FROM tracking_logs_view
      WHERE channel IS NOT NULL ORDER BY 1
    )                                                                   AS channels,
    ARRAY(
      SELECT DISTINCT zone FROM tracking_logs_view
      WHERE zone IS NOT NULL ORDER BY 1
    )                                                                   AS zones,
    to_char(
      MIN(time AT TIME ZONE 'America/Lima'), 'YYYY-MM-DD'
    )                                                                   AS min_date,
    to_char(
      MAX(time AT TIME ZONE 'America/Lima'), 'YYYY-MM-DD'
    )                                                                   AS max_date
  FROM tracking_logs_view
$$;
