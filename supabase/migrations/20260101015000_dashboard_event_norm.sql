-- ============================================================================
-- dashboard_event_norm · dependencia que no existía en el repositorio
-- ============================================================================
-- Esta función la invocan 20260829_database_io_optimization.sql,
-- 20260831_technical_dashboard_aggregation.sql y las RPC del dashboard, pero
-- no estaba definida en ningún archivo: solo vivía en la base de producción.
-- Consecuencia: las 15 migraciones del repo NO podían levantar un proyecto
-- nuevo; fallaban al validar el cuerpo de las funciones que la llaman.
-- Detectado al aplicar las migraciones en un Postgres 17 limpio (2026-09-12).
--
-- PROCEDENCIA: [PROBADO] reconstruida llamando a la función viva
-- public.dashboard_event_norm(p_event text) vía PostgREST, caso por caso:
--
--   'enter'        -> 'enter'        (identidad)
--   'exit'         -> 'exit'         (identidad)
--   'visitor'      -> 'visitor'      (identidad)
--   'pasante'      -> 'pasante'      (identidad)
--   'visitor_in'   -> 'visitor'      reescritura
--   'visitor_out'  -> 'visitor'      reescritura
--   'pass_out'     -> 'pasante'      reescritura
--   'time_in_zone' -> 'visit'        reescritura
--   'ENTER'        -> 'enter'        aplica lower()
--   '  enter  '    -> '  enter  '    NO aplica trim()
--   NULL           -> ''             coalesce a cadena vacía, no NULL
--   cualquier otro -> lower(entrada) pasa de largo
--
-- El nombre del parámetro es p_event: importa porque PostgREST resuelve las RPC
-- por nombre de argumento, no por posición.
--
-- [INFERIDO] la volatilidad: se declara IMMUTABLE porque es un mapeo puro. Si
-- el original fuera STABLE el plan podría diferir en algún índice de expresión.
-- ============================================================================

create or replace function public.dashboard_event_norm(p_event text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(p_event, ''))
           when 'visitor_in'   then 'visitor'
           when 'visitor_out'  then 'visitor'
           when 'pass_out'     then 'pasante'
           when 'time_in_zone' then 'visit'
           else lower(coalesce(p_event, ''))
         end
$$;

comment on function public.dashboard_event_norm(text) is
  'Normaliza códigos históricos de event_types a un vocabulario único: '
  'visitor_in/visitor_out->visitor, pass_out->pasante, time_in_zone->visit.';

notify pgrst, 'reload schema';
