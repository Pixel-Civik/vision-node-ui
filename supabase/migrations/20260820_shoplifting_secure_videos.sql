-- Video privado GCS alineado 1:1 con la alerta y accesible solo a operadores autenticados.
begin;

alter table public.shoplifting_alerts
  add column if not exists video_bucket text,
  add column if not exists video_object text,
  add column if not exists video_status text not null default 'none',
  add column if not exists video_uploaded_at timestamptz,
  add column if not exists video_size_bytes bigint;

alter table public.shoplifting_alerts
  drop constraint if exists shoplifting_alerts_video_status_check;
alter table public.shoplifting_alerts
  add constraint shoplifting_alerts_video_status_check
  check (video_status in ('none', 'pending', 'ready', 'failed'));

create unique index if not exists shoplifting_alerts_video_object_unique
  on public.shoplifting_alerts (video_bucket, video_object)
  where video_object is not null;

comment on column public.shoplifting_alerts.video_object is
  'Objeto MP4 privado en GCS; comparte el UUID y timestamp de esta alerta.';
comment on column public.shoplifting_alerts.video_status is
  'none, pending, ready o failed. Solo ready puede generar una URL temporal.';

revoke all on public.shoplifting_alerts from anon, authenticated;
grant select (
  id, site, camera_id, camera_name, occurred_at, risk_score, risk_reasons,
  status, thumbnail_path, duration_sec, metadata, created_at, reviewed_at,
  video_status, video_uploaded_at, video_size_bytes
) on public.shoplifting_alerts to anon;
grant select on public.shoplifting_alerts to authenticated;
grant update (status, reviewed_at) on public.shoplifting_alerts to authenticated;

drop policy if exists "dashboard revisa alertas shoplifting" on public.shoplifting_alerts;
create policy "operador revisa alertas shoplifting"
  on public.shoplifting_alerts for update to authenticated
  using (true)
  with check (status in ('confirmed', 'dismissed'));

commit;
