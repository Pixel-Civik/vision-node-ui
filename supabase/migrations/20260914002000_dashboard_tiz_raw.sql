-- ============================================================================
-- dashboard_tiz_raw · reemplaza la lectura directa de la vista desde el cliente
-- ============================================================================
-- src/lib/api.ts fetchTIZDirect consultaba tracking_logs_view con la anon key.
-- Desde 20260914000000 la vista respeta la RLS del invocador, así que esa
-- lectura devuelve 0 filas. Hoy no se nota —dwell_sec es 100% NULL en
-- producción— pero al encender la permanencia en zona el histograma quedaría
-- vacío por permisos, sin ningún error visible.
--
-- Esta RPC devuelve exactamente la misma forma que consumía el cliente
-- (time, dwell_sec, zone), pero como SECURITY DEFINER, igual que el resto de
-- la familia dashboard_*. La superficie expuesta es mucho más estrecha que la
-- vista completa: solo eventos de permanencia con duración, tres columnas, sin
-- track_id ni atributos de persona.
--
-- El límite de 5000 filas replica el .limit(5000) que tenía el cliente.
-- ============================================================================

create or replace function public.dashboard_tiz_raw(
  p_start_ts timestamptz,
  p_end_ts   timestamptz,
  p_limit    int default 5000
)
returns table("time" timestamptz, dwell_sec numeric, zone text)
language sql
stable security definer
set statement_timeout to '30s'
as $$
  select v."time", v.dwell_sec, v.zone
  from public.tracking_logs_view v
  where v.event = 'visit'
    and v."time" >= p_start_ts
    and v."time" <= p_end_ts
    and v.dwell_sec is not null
  order by v."time"
  limit least(coalesce(p_limit, 5000), 5000)
$$;

comment on function public.dashboard_tiz_raw(timestamptz, timestamptz, int) is
  'Filas crudas de permanencia en zona para el histograma de distribución. '
  'Existe para que el cliente no lea tracking_logs_view directamente.';

notify pgrst, 'reload schema';
