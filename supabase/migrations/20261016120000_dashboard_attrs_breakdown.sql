-- Reporte general: entradas por grupo de edad (nino/adulto) y género
-- (hombre/mujer), con "sin etiqueta" (NULL) como categoría propia.
--
-- Mismos filtros que el resto del dashboard (sitio, cámara, zona, horas, días).
-- Cuenta solo `enter` (la métrica de visitantes del reporte).
-- Devuelve una fila por (bucket, age, gender):
--   p_granularity = 'hour' -> bucket = 'HH'          (hora Lima, 00-23)
--   p_granularity = 'day'  -> bucket = 'YYYY-MM-DD'  (día Lima)
-- age    : 'nino' | 'adulto' | NULL   (joven / adulto mayor cuentan como adulto;
--                                      'edad_no_detectada' y vacíos = NULL)
-- gender : 'hombre' | 'mujer' | NULL  ('genero_no_detectado' y vacíos = NULL)
--
-- Idempotente. NO aplicada todavía en la base remota.

CREATE OR REPLACE FUNCTION public.dashboard_attrs_breakdown(
  p_start_ts    timestamptz,
  p_end_ts      timestamptz,
  p_sites       text[] DEFAULT NULL,
  p_channels    text[] DEFAULT NULL,
  p_zones       text[] DEFAULT NULL,
  p_hour_min    int    DEFAULT 0,
  p_hour_max    int    DEFAULT 23,
  p_dows        int[]  DEFAULT NULL,
  p_granularity text   DEFAULT 'day'
)
RETURNS TABLE(
  bucket text,
  age    text,
  gender text,
  count  bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET statement_timeout TO '15s'
SET plan_cache_mode TO 'force_custom_plan'
AS $$
  WITH base AS MATERIALIZED (
    SELECT
      (e."time" AT TIME ZONE 'America/Lima') AS local_ts,
      lower(btrim(e.age))    AS a,
      lower(btrim(e.gender)) AS g
    FROM public.events e
    WHERE e."time" >= p_start_ts
      AND e."time" <= p_end_ts
      AND e.event_type_id IN (
        SELECT et.id
        FROM public.event_types et
        WHERE public.dashboard_event_norm(et.code) = 'enter'
      )
      AND (p_sites IS NULL OR e.site_id IN (
        SELECT s.id FROM public.sites s WHERE s.name = ANY(p_sites)
      ))
      AND (p_channels IS NULL OR e.camera_id IN (
        SELECT c.id FROM public.cameras c WHERE c.channel = ANY(p_channels)
      ))
      AND (p_zones IS NULL OR e.zone = ANY(p_zones))
      AND (p_hour_min IS NULL OR
        extract(hour FROM (e."time" AT TIME ZONE 'America/Lima'))::int
          BETWEEN p_hour_min AND p_hour_max)
      AND (p_dows IS NULL OR
        (extract(isodow FROM (e."time" AT TIME ZONE 'America/Lima'))::int - 1)
          = ANY(p_dows))
  )
  SELECT
    CASE WHEN p_granularity = 'hour'
      THEN to_char(local_ts, 'HH24')
      ELSE to_char(local_ts, 'YYYY-MM-DD')
    END AS bucket,
    CASE
      WHEN a LIKE '%nino%' OR a LIKE '%niño%' OR a LIKE '%child%' THEN 'nino'
      WHEN a LIKE '%adult%' OR a LIKE '%joven%' OR a LIKE '%mayor%'
        OR a LIKE '%young%' OR a LIKE '%senior%' THEN 'adulto'
      ELSE NULL
    END AS age,
    CASE
      WHEN g IN ('hombre', 'm', 'male', 'man') THEN 'hombre'
      WHEN g IN ('mujer', 'f', 'female', 'woman') THEN 'mujer'
      ELSE NULL
    END AS gender,
    COUNT(*)::bigint AS count
  FROM base
  GROUP BY 1, 2, 3
  ORDER BY 1, 2, 3;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_attrs_breakdown(
  timestamptz, timestamptz, text[], text[], text[], int, int, int[], text
) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
