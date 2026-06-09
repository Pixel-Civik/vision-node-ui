-- ============================================================
-- dashboard_gender_age
-- Reemplaza el fetch de 5 000 filas crudas en fetchGenderAge.
-- Devuelve conteos agrupados por género y por rango de edad.
-- ============================================================

CREATE OR REPLACE FUNCTION dashboard_gender_age(
  p_start_ts    timestamptz,
  p_end_ts      timestamptz,
  p_event_types text[]
)
RETURNS TABLE(
  dimension  text,   -- 'gender' | 'age'
  value      text,
  count      bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 'gender' AS dimension, gender AS value, COUNT(*) AS count
  FROM tracking_logs_view
  WHERE
    time BETWEEN p_start_ts AND p_end_ts
    AND event = ANY(p_event_types)
    AND gender IS NOT NULL
    AND gender <> 'genero_no_detectado'
  GROUP BY gender

  UNION ALL

  SELECT 'age' AS dimension, age AS value, COUNT(*) AS count
  FROM tracking_logs_view
  WHERE
    time BETWEEN p_start_ts AND p_end_ts
    AND event = ANY(p_event_types)
    AND age IS NOT NULL
    AND age <> 'edad_no_detectada'
  GROUP BY age

  ORDER BY dimension, count DESC
$$;
