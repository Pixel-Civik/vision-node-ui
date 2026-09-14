-- Historial inmutable de evidencias de shoplifting.
-- Cada detección sospechosa conserva su propia fila e imagen comprimida.

begin;

-- El modo anterior forzaba una sola fila por site+cámara y hacía que
-- PostgREST reemplazara la alerta anterior. El historial necesita permitir
-- múltiples alertas de la misma cámara.
drop index if exists public.shoplifting_alerts_site_camera_unique;

-- Una ruta de Storage representa exactamente una evidencia. El índice parcial
-- permite conservar filas legacy sin imagen y evita asociaciones accidentales.
create unique index if not exists shoplifting_alerts_thumbnail_path_unique
  on public.shoplifting_alerts (thumbnail_path)
  where thumbnail_path is not null;

create index if not exists shoplifting_alerts_site_camera_occurred_idx
  on public.shoplifting_alerts (site, camera_id, occurred_at desc);

comment on table public.shoplifting_alerts is
  'Historial de alertas visuales; una fila y un JPG comprimido por detección sospechosa.';
comment on column public.shoplifting_alerts.thumbnail_path is
  'Ruta privada e inmutable del JPG asociado exclusivamente a esta alerta.';

commit;
