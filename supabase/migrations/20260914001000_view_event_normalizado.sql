-- ============================================================================
-- tracking_logs_view debe exponer el código de evento NORMALIZADO
-- ============================================================================
-- El baseline reconstruyó la vista con `et.code as event`, es decir el código
-- crudo de event_types. Es incorrecto: la vista de producción aplicaba
-- dashboard_event_norm(). La prueba está dentro del propio repositorio —
-- dashboard_tiz_zone_stats consulta la vista así:
--
--     ... AND event = 'visit' AND dwell_sec IS NOT NULL
--
-- y 'visit' NO es un código de event_types. Los códigos son enter, exit,
-- visitor, visitor_in, visitor_out, pasante, pass_out y time_in_zone. 'visit'
-- lo produce únicamente dashboard_event_norm('time_in_zone'). Para que esa
-- consulta haya funcionado alguna vez, la vista tenía que normalizar.
--
-- POR QUÉ NO LO DETECTÓ LA VALIDACIÓN
--
-- La comparación byte a byte entre el proyecto viejo y el nuevo dio valores
-- idénticos, pero no podía distinguir: los únicos códigos presentes en los
-- datos son enter, exit, visitor y pasante, y para esos cuatro
-- dashboard_event_norm es la identidad. La diferencia solo aparece cuando se
-- generan visitor_in, visitor_out, pass_out o time_in_zone — que hoy tienen
-- cero filas. Es un error latente, no uno activo: al encender la permanencia
-- en zona, la vista habría emitido 'time_in_zone' mientras toda la capa de
-- consulta esperaba 'visit', y los paneles de permanencia habrían salido
-- vacíos sin ningún error.
--
-- Se mantiene security_invoker, fijado en 20260914000000.
-- ============================================================================

create or replace view public.tracking_logs_view as
select
  e.id                                          as event_id,
  s.name                                        as site,
  s.slug                                        as site_slug,
  c.channel                                     as channel,
  c.name                                        as camera_name,
  public.dashboard_event_norm(et.code)          as event,
  e.zone                                        as zone,
  e."time"                                      as "time",
  e."time"      at time zone 'America/Lima'     as time_lima,
  e.track_id                                    as track_id,
  e.gender                                      as gender,
  e.age                                         as age,
  e.dwell_sec                                   as dwell_sec,
  e.time_enter                                  as time_enter,
  e.time_enter  at time zone 'America/Lima'     as time_enter_lima,
  e.time_end                                    as time_end,
  e.time_end    at time zone 'America/Lima'     as time_end_lima,
  e.clip_url                                    as clip_url
from public.events e
left join public.sites       s  on s.id  = e.site_id
left join public.cameras     c  on c.id  = e.camera_id
left join public.event_types et on et.id = e.event_type_id;

alter view public.tracking_logs_view set (security_invoker = on);

notify pgrst, 'reload schema';
