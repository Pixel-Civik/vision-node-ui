-- Las horas sin operación no cuentan como inactividad. Al abrir la tienda,
-- cada monitor obtiene nuevamente su período de tolerancia completo.

alter table public.edge_nodes
  alter column operating_end set default '23:30'::time;

update public.edge_nodes
set operating_start = '07:00'::time,
    operating_end = '23:30'::time
where node_id in ('miraflores1-n100-01', 'miraflores1-jetson-01');

drop function if exists public.edge_node_alert_states();
create function public.edge_node_alert_states()
returns table (
  node_id text, site text, display_name text, service_name text,
  service_status text, alert_type text, alert_key text, camera_id text,
  active boolean, age_min integer, last_signal_at timestamptz, details jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with local_clock as (
    select
      (now() at time zone 'America/Lima')::date as local_day,
      (now() at time zone 'America/Lima')::time as local_time
  ), node_bounds as (
    select n.*,
      (
        case
          when n.operating_start < n.operating_end
            then l.local_day + n.operating_start
          when l.local_time >= n.operating_start
            then l.local_day + n.operating_start
          else l.local_day - 1 + n.operating_start
        end
      ) at time zone 'America/Lima' as window_start,
      (
        case
          when n.operating_start < n.operating_end
            then l.local_day + n.operating_end
          when l.local_time >= n.operating_start
            then l.local_day + 1 + n.operating_end
          else l.local_day + n.operating_end
        end
      ) at time zone 'America/Lima' as window_end
    from public.edge_nodes n
    cross join local_clock l
  ), scheduled_nodes as (
    select n.*, now() >= n.window_start and now() < n.window_end as in_window
    from node_bounds n
  )
  -- 1. Equipo completo sin heartbeat. El tiempo nocturno no se acumula y al
  -- abrir se esperan nuevamente los 30 min configurados.
  select n.node_id, n.site, n.display_name, n.service_name, n.service_status,
    'node_offline'::text, 'node'::text, null::text,
    n.in_window
      and now() - greatest(n.last_seen_at, n.window_start)
        >= make_interval(secs => n.offline_after_sec),
    greatest(0, extract(epoch from (
      now() - greatest(n.last_seen_at, n.window_start)
    )) / 60)::integer,
    n.last_seen_at,
    jsonb_build_object(
      'service_status', n.service_status,
      'operating_start', n.operating_start,
      'operating_end', n.operating_end
    )
  from scheduled_nodes n
  where n.alerts_enabled

  union all

  -- 2. N100 vivo, pero sin IDs nuevos durante 30 min operativos.
  select n.node_id, n.site, n.display_name, n.service_name, n.service_status,
    'tracking_stale'::text, 'tracking'::text, null::text,
    n.in_window
      and n.tracking_enabled
      and n.service_name = 'people-tracking'
      and n.service_status in ('running', 'scheduled', 'healthy')
      and now() - n.last_seen_at <= make_interval(secs => n.offline_after_sec)
      and now() - greatest(
        coalesce(n.last_tracking_at, n.created_at), n.window_start
      ) >= make_interval(secs => n.tracking_stale_sec),
    greatest(0, extract(epoch from (
      now() - greatest(coalesce(n.last_tracking_at, n.created_at), n.window_start)
    )) / 60)::integer,
    coalesce(n.last_tracking_at, n.created_at),
    jsonb_build_object(
      'tracking_status', 'stale',
      'operating_start', n.operating_start,
      'operating_end', n.operating_end
    )
  from scheduled_nodes n
  where n.alerts_enabled and n.tracking_enabled and n.service_name = 'people-tracking'

  union all

  -- 3. Proceso principal degradado. Al abrir se aplican sus 5 min de gracia.
  select n.node_id, n.site, n.display_name, n.service_name, n.service_status,
    'service_unhealthy'::text, 'service'::text, null::text,
    n.in_window
      and now() - n.last_seen_at <= make_interval(secs => n.offline_after_sec)
      and n.service_status not in ('running', 'scheduled', 'healthy')
      and now() - greatest(n.service_status_changed_at, n.window_start)
        >= make_interval(secs => n.service_alert_after_sec),
    greatest(0, extract(epoch from (
      now() - greatest(n.service_status_changed_at, n.window_start)
    )) / 60)::integer,
    n.service_status_changed_at,
    jsonb_build_object(
      'service_status', n.service_status,
      'operating_start', n.operating_start,
      'operating_end', n.operating_end
    )
  from scheduled_nodes n
  where n.alerts_enabled

  union all

  -- 4. Cámara individual. `unhealthy_since` no se reinicia con cada intento de
  -- FFmpeg y la ventana de 5 min vuelve a empezar a las 07:00.
  select n.node_id, n.site, n.display_name, n.service_name, n.service_status,
    'camera_unhealthy'::text, camera.key, camera.key,
    n.in_window
      and n.service_status <> 'scheduled'
      and coalesce(camera.value->>'status', 'unknown') <> 'scheduled'
      and now() - n.last_seen_at <= make_interval(secs => n.offline_after_sec)
      and (
        coalesce((camera.value->>'connected')::boolean, true) = false
        or coalesce(camera.value->>'status', 'unknown') in ('error', 'stopped', 'degraded')
        or now() - nullif(camera.value->>'last_connection_at', '')::timestamptz
          >= make_interval(secs => n.service_alert_after_sec)
      )
      and now() - greatest(
        coalesce(
          nullif(camera.value->>'unhealthy_since', '')::timestamptz,
          nullif(camera.value->>'last_connection_at', '')::timestamptz,
          n.created_at
        ),
        n.window_start
      ) >= make_interval(secs => n.service_alert_after_sec),
    greatest(0, extract(epoch from (
      now() - greatest(
        coalesce(
          nullif(camera.value->>'unhealthy_since', '')::timestamptz,
          nullif(camera.value->>'last_connection_at', '')::timestamptz,
          n.created_at
        ),
        n.window_start
      )
    )) / 60)::integer,
    coalesce(
      nullif(camera.value->>'unhealthy_since', '')::timestamptz,
      nullif(camera.value->>'last_connection_at', '')::timestamptz
    ),
    jsonb_build_object(
      'camera_id', camera.key,
      'camera_status', camera.value->>'status',
      'fps', camera.value->>'processed_fps',
      'errors_total', camera.value->>'errors_total',
      'last_error', camera.value->>'last_error',
      'operating_start', n.operating_start,
      'operating_end', n.operating_end
    )
  from scheduled_nodes n
  cross join lateral jsonb_each(n.cameras) camera
  where n.alerts_enabled
    and nullif(camera.value->>'last_connection_at', '') is not null;
$$;

revoke all on function public.edge_node_alert_states() from public, anon, authenticated;
grant execute on function public.edge_node_alert_states() to service_role;
