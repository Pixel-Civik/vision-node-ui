-- Clasificacion humana auditable y anclada al MP4 privado exacto de GCS.
-- La vista final queda preparada para consumidores de entrenamiento autorizados.
begin;

alter table public.shoplifting_alerts
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists review_notes text,
  add column if not exists training_eligible boolean not null default true,
  add column if not exists review_version integer not null default 0;

alter table public.shoplifting_alerts
  drop constraint if exists shoplifting_alerts_review_notes_length_check;
alter table public.shoplifting_alerts
  add constraint shoplifting_alerts_review_notes_length_check
  check (review_notes is null or char_length(review_notes) <= 2000);

alter table public.shoplifting_alerts
  drop constraint if exists shoplifting_alerts_review_version_check;
alter table public.shoplifting_alerts
  add constraint shoplifting_alerts_review_version_check
  check (review_version >= 0);

create table if not exists public.shoplifting_alert_reviews (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.shoplifting_alerts(id) on delete cascade,
  review_version integer not null check (review_version > 0),
  decision text not null check (decision in ('confirmed', 'dismissed')),
  training_label text not null check (training_label in ('suspicious', 'normal')),
  training_eligible boolean not null default true,
  reviewer_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz not null default clock_timestamp(),
  notes text check (notes is null or char_length(notes) <= 2000),
  source_site text not null,
  source_camera_id text not null,
  source_camera_name text,
  source_occurred_at timestamptz not null,
  source_risk_score double precision not null,
  source_risk_reasons text[] not null default '{}',
  source_video_bucket text not null,
  source_video_object text not null,
  source_video_size_bytes bigint not null check (source_video_size_bytes > 0),
  source_video_uploaded_at timestamptz not null,
  source_evidence_generation text not null,
  source_metadata jsonb not null default '{}',
  unique (alert_id, review_version)
);

create index if not exists shoplifting_alert_reviews_training_idx
  on public.shoplifting_alert_reviews (training_eligible, reviewed_at desc);
create index if not exists shoplifting_alert_reviews_label_idx
  on public.shoplifting_alert_reviews (training_label, reviewed_at desc)
  where training_eligible;

comment on table public.shoplifting_alert_reviews is
  'Historial inmutable de decisiones humanas; cada revision conserva el objeto exacto de GCS usado para etiquetar.';
comment on column public.shoplifting_alert_reviews.source_video_object is
  'Ruta inmutable del MP4 privado revisado. Nunca se recibe desde el navegador: se copia de shoplifting_alerts dentro de la transaccion.';

alter table public.shoplifting_alert_reviews enable row level security;

revoke all on public.shoplifting_alert_reviews from public, anon, authenticated;
grant select on public.shoplifting_alert_reviews to authenticated;
grant select on public.shoplifting_alert_reviews to service_role;
grant select on public.shoplifting_alerts to service_role;

drop policy if exists "operador lee revisiones shoplifting" on public.shoplifting_alert_reviews;
create policy "operador lee revisiones shoplifting"
  on public.shoplifting_alert_reviews for select to authenticated
  using (true);

-- La revision deja de aceptar UPDATE directo: toda decision debe pasar por el
-- RPC para que alerta, historial y video permanezcan alineados atomicamente.
revoke update on public.shoplifting_alerts from authenticated;
drop policy if exists "operador revisa alertas shoplifting" on public.shoplifting_alerts;

create or replace function public.review_shoplifting_alert(
  p_alert_id uuid,
  p_status text,
  p_notes text default null,
  p_training_eligible boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_alert public.shoplifting_alerts%rowtype;
  v_reviewer uuid := auth.uid();
  v_reviewed_at timestamptz := clock_timestamp();
  v_review_version integer;
  v_training_label text;
  v_notes text := nullif(btrim(p_notes), '');
begin
  if v_reviewer is null then
    raise exception using
      errcode = '42501',
      message = 'Debes iniciar sesion como operador para clasificar la alerta.';
  end if;

  if p_status not in ('confirmed', 'dismissed') then
    raise exception using
      errcode = '22023',
      message = 'La decision debe ser confirmed o dismissed.';
  end if;

  if v_notes is not null and char_length(v_notes) > 2000 then
    raise exception using
      errcode = '22023',
      message = 'Las notas no pueden superar 2000 caracteres.';
  end if;

  select *
    into v_alert
    from public.shoplifting_alerts
   where id = p_alert_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'La alerta solicitada no existe.';
  end if;

  if v_alert.video_status <> 'ready'
     or v_alert.video_bucket is null
     or v_alert.video_object is null
     or coalesce(v_alert.video_size_bytes, 0) <= 0
     or v_alert.video_uploaded_at is null then
    raise exception using
      errcode = '23514',
      message = 'La alerta aun no tiene un video GCS listo y verificable.';
  end if;

  if coalesce(v_alert.metadata ->> 'evidence_generation', '') <> 'h264-faststart-v1' then
    raise exception using
      errcode = '23514',
      message = 'El video pertenece a una generacion de evidencia incompatible.';
  end if;

  v_review_version := v_alert.review_version + 1;
  v_training_label := case when p_status = 'confirmed' then 'suspicious' else 'normal' end;

  update public.shoplifting_alerts
     set status = p_status,
         reviewed_at = v_reviewed_at,
         reviewed_by = v_reviewer,
         review_notes = v_notes,
         training_eligible = p_training_eligible,
         review_version = v_review_version
   where id = p_alert_id;

  insert into public.shoplifting_alert_reviews (
    alert_id, review_version, decision, training_label, training_eligible,
    reviewer_id, reviewed_at, notes, source_site, source_camera_id,
    source_camera_name, source_occurred_at, source_risk_score,
    source_risk_reasons, source_video_bucket, source_video_object,
    source_video_size_bytes, source_video_uploaded_at,
    source_evidence_generation, source_metadata
  ) values (
    v_alert.id, v_review_version, p_status, v_training_label,
    p_training_eligible, v_reviewer, v_reviewed_at, v_notes, v_alert.site,
    v_alert.camera_id, v_alert.camera_name, v_alert.occurred_at,
    v_alert.risk_score, v_alert.risk_reasons, v_alert.video_bucket,
    v_alert.video_object, v_alert.video_size_bytes, v_alert.video_uploaded_at,
    v_alert.metadata ->> 'evidence_generation', v_alert.metadata
  );

  return jsonb_build_object(
    'alert_id', v_alert.id,
    'status', p_status,
    'training_label', v_training_label,
    'training_eligible', p_training_eligible,
    'review_version', v_review_version,
    'reviewed_at', v_reviewed_at,
    'video_bucket', v_alert.video_bucket,
    'video_object', v_alert.video_object
  );
end;
$$;

revoke all on function public.review_shoplifting_alert(uuid, text, text, boolean)
  from public, anon;
grant execute on function public.review_shoplifting_alert(uuid, text, text, boolean)
  to authenticated;

comment on function public.review_shoplifting_alert(uuid, text, text, boolean) is
  'Clasifica una alerta y crea una revision auditable anclada al MP4 GCS exacto, en una sola transaccion.';

create or replace view public.shoplifting_training_dataset
with (security_invoker = true)
as
select
  a.id as alert_id,
  r.id as review_id,
  r.review_version,
  r.training_label,
  r.training_eligible,
  r.reviewer_id,
  r.reviewed_at,
  r.notes as review_notes,
  r.source_site as site,
  r.source_camera_id as camera_id,
  r.source_camera_name as camera_name,
  r.source_occurred_at as occurred_at,
  r.source_risk_score as model_risk_score,
  r.source_risk_reasons as model_risk_reasons,
  r.source_video_bucket as video_bucket,
  r.source_video_object as video_object,
  r.source_video_size_bytes as video_size_bytes,
  r.source_video_uploaded_at as video_uploaded_at,
  r.source_evidence_generation as evidence_generation,
  r.source_metadata as model_metadata
from public.shoplifting_alerts a
join public.shoplifting_alert_reviews r
  on r.alert_id = a.id
 and r.review_version = a.review_version
where a.status in ('confirmed', 'dismissed')
  and a.video_status = 'ready'
  and r.training_eligible;

revoke all on public.shoplifting_training_dataset from public, anon;
grant select on public.shoplifting_training_dataset to authenticated, service_role;

comment on view public.shoplifting_training_dataset is
  'Ultima etiqueta humana valida por alerta, con ancla exacta al MP4 privado para entrenamiento o evaluacion.';

commit;
