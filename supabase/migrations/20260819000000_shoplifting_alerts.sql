-- Evidencias de shoplifting generadas por los nodos Jetson.
-- Idempotente: se puede ejecutar nuevamente sin duplicar políticas/publicación.

create extension if not exists pgcrypto;

create table if not exists public.shoplifting_alerts (
  id uuid primary key default gen_random_uuid(),
  site text not null default 'tienda',
  camera_id text not null,
  camera_name text,
  occurred_at timestamptz not null,
  risk_score double precision not null check (risk_score between 0 and 1),
  risk_reasons text[] not null default '{}',
  status text not null default 'new' check (status in ('new', 'confirmed', 'dismissed')),
  video_path text not null unique,
  thumbnail_path text,
  duration_sec double precision,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists shoplifting_alerts_occurred_idx
  on public.shoplifting_alerts (occurred_at desc);
create index if not exists shoplifting_alerts_status_occurred_idx
  on public.shoplifting_alerts (status, occurred_at desc);
create index if not exists shoplifting_alerts_camera_occurred_idx
  on public.shoplifting_alerts (camera_id, occurred_at desc);

alter table public.shoplifting_alerts enable row level security;
revoke all on public.shoplifting_alerts from anon, authenticated;
grant select on public.shoplifting_alerts to anon, authenticated;
grant update (status, reviewed_at) on public.shoplifting_alerts to anon, authenticated;

drop policy if exists "dashboard lee alertas shoplifting" on public.shoplifting_alerts;
create policy "dashboard lee alertas shoplifting"
  on public.shoplifting_alerts for select to anon, authenticated using (true);

drop policy if exists "dashboard revisa alertas shoplifting" on public.shoplifting_alerts;
create policy "dashboard revisa alertas shoplifting"
  on public.shoplifting_alerts for update to anon, authenticated
  using (true)
  with check (status in ('confirmed', 'dismissed'));

-- El bucket shoplifting-evidence es privado. El Jetson usa una secret/service key
-- para escribir; el dashboard solo puede leer y crear URLs temporales.
drop policy if exists "dashboard lee evidencia shoplifting" on storage.objects;
create policy "dashboard lee evidencia shoplifting"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'shoplifting-evidence');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shoplifting_alerts'
  ) then
    execute 'alter publication supabase_realtime add table public.shoplifting_alerts';
  end if;
end $$;
