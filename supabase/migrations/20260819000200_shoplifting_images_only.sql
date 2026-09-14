-- Modo económico: una sola imagen comprimida y una sola fila por cámara.
-- Los videos permanecen exclusivamente en el almacenamiento local del Jetson.

alter table public.shoplifting_alerts
  alter column video_path drop not null;

-- Si hubiera datos anteriores, conservar únicamente la alerta más reciente
-- antes de crear la restricción site+cámara.
delete from public.shoplifting_alerts older
using public.shoplifting_alerts newer
where older.site = newer.site
  and older.camera_id = newer.camera_id
  and (
    older.occurred_at < newer.occurred_at
    or (older.occurred_at = newer.occurred_at and older.id < newer.id)
  );

create unique index if not exists shoplifting_alerts_site_camera_unique
  on public.shoplifting_alerts (site, camera_id);

comment on table public.shoplifting_alerts is
  'Última alerta visual por site y cámara; evidencia cloud solo JPG comprimido.';
comment on column public.shoplifting_alerts.thumbnail_path is
  'Ruta privada del JPG latest.jpg; reemplazada por cada alerta nueva.';
comment on column public.shoplifting_alerts.video_path is
  'Legacy, siempre NULL en modo image-only; los videos quedan locales.';
