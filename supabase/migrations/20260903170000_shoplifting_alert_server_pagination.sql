-- Evita descargar miles de alertas para representar una página de 24 filas.
-- La respuesta incluye la página, el total filtrado y los contadores globales.

create index if not exists shoplifting_alerts_evidence_camera_status_occurred_idx
  on public.shoplifting_alerts (camera_id, status, occurred_at desc)
  where metadata @> '{"evidence_generation":"h264-faststart-v1"}'::jsonb;

create or replace function public.dashboard_shoplifting_alert_page(
  p_offset integer default 0,
  p_limit integer default 24,
  p_camera_id text default null,
  p_status text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
  with summary as (
    select
      count(*) filter (where a.status = 'new')::bigint as new_count,
      count(*) filter (where a.status = 'confirmed')::bigint as confirmed_count,
      count(*) filter (where a.status = 'dismissed')::bigint as dismissed_count,
      coalesce(
        array_agg(distinct a.camera_id order by a.camera_id)
          filter (where a.camera_id is not null),
        array[]::text[]
      ) as cameras
    from public.shoplifting_alerts a
    where a.metadata @> '{"evidence_generation":"h264-faststart-v1"}'::jsonb
  ), filtered_count as (
    select count(*)::bigint as n
    from public.shoplifting_alerts a
    where a.metadata @> '{"evidence_generation":"h264-faststart-v1"}'::jsonb
      and (p_camera_id is null or a.camera_id = p_camera_id)
      and (p_status is null or a.status = p_status)
  ), page_rows as (
    select
      a.id, a.site, a.camera_id, a.camera_name, a.occurred_at,
      a.risk_score, a.risk_reasons, a.status, a.thumbnail_path,
      a.duration_sec, a.metadata, a.created_at, a.reviewed_at,
      a.video_status, a.video_uploaded_at, a.video_size_bytes
    from public.shoplifting_alerts a
    where a.metadata @> '{"evidence_generation":"h264-faststart-v1"}'::jsonb
      and (p_camera_id is null or a.camera_id = p_camera_id)
      and (p_status is null or a.status = p_status)
    order by a.occurred_at desc
    offset greatest(p_offset, 0)
    limit least(greatest(p_limit, 1), 100)
  )
  select jsonb_build_object(
    'alerts', coalesce(
      (select jsonb_agg(to_jsonb(p) order by p.occurred_at desc) from page_rows p),
      '[]'::jsonb
    ),
    'total', (select n from filtered_count),
    'new_count', s.new_count,
    'confirmed_count', s.confirmed_count,
    'dismissed_count', s.dismissed_count,
    'cameras', to_jsonb(s.cameras)
  )
  from summary s;
$$;

revoke all on function public.dashboard_shoplifting_alert_page(
  integer, integer, text, text
) from public;
grant execute on function public.dashboard_shoplifting_alert_page(
  integer, integer, text, text
) to anon, authenticated;

comment on function public.dashboard_shoplifting_alert_page(
  integer, integer, text, text
) is 'Returns one bounded alert page plus aggregate counters; avoids multi-thousand-row browser reads.';
