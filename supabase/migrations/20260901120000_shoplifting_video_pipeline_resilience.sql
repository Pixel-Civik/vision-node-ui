-- Estado monotónico del MP4 y resolución O(1) de evidencia para el frontend.
-- Evita que un reintento antiguo cambie ready -> failed/pending y elimina la
-- necesidad de listar carpetas completas de GCS para encontrar un video.
begin;

create or replace function public.apply_shoplifting_video_state(
  p_alert_id uuid,
  p_status text,
  p_size_bytes bigint default 0,
  p_error text default null,
  p_video_bucket text default null,
  p_video_object text default null,
  p_duration_sec numeric default null,
  p_risk_score double precision default null,
  p_risk_reasons text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_alert public.shoplifting_alerts%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_status not in ('pending', 'ready', 'failed') then
    raise exception using errcode = '22023', message = 'Estado de video invalido.';
  end if;

  select * into v_alert
    from public.shoplifting_alerts
   where id = p_alert_id
   for update;

  if not found then
    return jsonb_build_object(
      'accepted', false,
      'applied', false,
      'reason', 'alert_not_found'
    );
  end if;

  -- La entrega es monotónica: una notificación recuperada desde disco no
  -- puede degradar un MP4 que GCS ya confirmó y el dashboard ya puede abrir.
  if v_alert.video_status = 'ready' and p_status <> 'ready' then
    return jsonb_build_object(
      'accepted', true,
      'applied', false,
      'reason', 'already_ready',
      'status', v_alert.video_status
    );
  end if;

  if p_status = 'ready' and (
    nullif(btrim(p_video_bucket), '') is null
    or nullif(btrim(p_video_object), '') is null
    or coalesce(p_size_bytes, 0) <= 0
  ) then
    raise exception using
      errcode = '23514',
      message = 'ready exige bucket, objeto y tamano positivo.';
  end if;

  update public.shoplifting_alerts
     set video_status = p_status,
         video_size_bytes = case
           when coalesce(p_size_bytes, 0) > 0 then p_size_bytes
           else video_size_bytes
         end,
         video_uploaded_at = case
           when p_status = 'ready' then v_now
           else video_uploaded_at
         end,
         video_bucket = coalesce(nullif(btrim(p_video_bucket), ''), video_bucket),
         video_object = coalesce(nullif(btrim(p_video_object), ''), video_object),
         video_path = case
           when nullif(btrim(p_video_bucket), '') is not null
            and nullif(btrim(p_video_object), '') is not null
             then 'gs://' || btrim(p_video_bucket) || '/' || btrim(p_video_object)
           else video_path
         end,
         duration_sec = coalesce(p_duration_sec, duration_sec),
         risk_score = coalesce(p_risk_score, risk_score),
         risk_reasons = coalesce(p_risk_reasons, risk_reasons),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'video_delivery',
           jsonb_strip_nulls(jsonb_build_object(
             'status', p_status,
             'updated_at', v_now,
             'error', nullif(left(coalesce(p_error, ''), 500), '')
           ))
         )
   where id = p_alert_id;

  return jsonb_build_object(
    'accepted', true,
    'applied', true,
    'status', p_status,
    'updated_at', v_now
  );
end;
$$;

revoke all on function public.apply_shoplifting_video_state(
  uuid, text, bigint, text, text, text, numeric, double precision, text[]
) from public, anon, authenticated;
grant execute on function public.apply_shoplifting_video_state(
  uuid, text, bigint, text, text, text, numeric, double precision, text[]
) to service_role;

comment on function public.apply_shoplifting_video_state(
  uuid, text, bigint, text, text, text, numeric, double precision, text[]
) is 'Actualiza de forma idempotente y monotónica la entrega del MP4 privado.';

create or replace function public.resolve_shoplifting_evidence(
  p_alert_id uuid,
  p_camera_id text,
  p_occurred_at timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'video_bucket', a.video_bucket,
    'video_object', a.video_object,
    'thumbnail_object', nullif(a.metadata ->> 'gcs_thumbnail_object', ''),
    'video_size_bytes', a.video_size_bytes,
    'video_uploaded_at', a.video_uploaded_at
  )
  from public.shoplifting_alerts a
  where a.id = p_alert_id
    and a.camera_id = p_camera_id
    and abs(extract(epoch from (a.occurred_at - p_occurred_at))) < 1
    and a.video_status = 'ready'
    and a.video_bucket is not null
    and a.video_object is not null
    and coalesce(a.video_size_bytes, 0) > 0
    and coalesce(a.metadata ->> 'evidence_generation', '') = 'h264-faststart-v1';
$$;

revoke all on function public.resolve_shoplifting_evidence(uuid, text, timestamptz)
  from public;
grant execute on function public.resolve_shoplifting_evidence(uuid, text, timestamptz)
  to anon, authenticated, service_role;

comment on function public.resolve_shoplifting_evidence(uuid, text, timestamptz) is
  'Resuelve el objeto GCS exacto de una alerta lista sin recorrer prefijos del bucket.';

commit;
