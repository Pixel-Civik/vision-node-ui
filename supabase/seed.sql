-- ============================================================================
-- Datos de catálogo · extraídos de producción el 2026-09-12
-- ============================================================================
-- Los catálogos son parte de la definición del producto, no datos de usuario:
-- sin ellos las FK de events no resuelven y el dashboard no tiene etiquetas.
-- Esto NO incluye la tabla events (262k filas): esa es migración de datos,
-- ver MIGRACION_A_PIXEL.md paso 6.
--
-- Idempotente: se puede correr varias veces.
-- ============================================================================

-- ─── event_groups ──────────────────────────────────────────────────────────
-- La fila id=1 TIENE que existir porque los 8 event_types la referencian por
-- FK. Sus valores originales nunca se pudieron leer del proyecto de origen (RLS
-- los ocultaba a la anon key), pero tampoco hacía falta: se comprobó que NADIE
-- consume el contenido de esta tabla — ni el UI ni ninguna otra migración. Solo
-- existe como destino de la FK. Así que se nombra aquí de forma descriptiva, y
-- estos SON los valores canónicos de ahora en adelante.
insert into public.event_groups (id, code, label, description) values
  (1, 'conteo_personas', 'Conteo de personas',
   'Eventos del pipeline de tracking peatonal: entradas, salidas, visitantes, pasantes y permanencia en zona.')
on conflict (id) do nothing;

-- ─── sites ─────────────────────────────────────────────────────────────────
insert into public.sites (id, name, slug, created_at) values
  (1, 'miraflores1',  'miraflores1',  '2026-03-11T19:19:32.900108-05:00'),
  (2, 'Miraflores 2', 'miraflores2',  '2026-03-11T19:19:32.900108-05:00')
on conflict (id) do nothing;

-- ─── cameras ───────────────────────────────────────────────────────────────
insert into public.cameras (id, site_id, channel, active, name) values
  (1, 1, '101',  true, null),
  (2, 1, '501',  true, null),
  (3, 1, '701',  true, null),
  (4, 1, '1301', true, null),
  (5, 1, '1401', true, null),
  (6, 2, '901',  true, null)
on conflict (id) do nothing;

-- ─── event_types ───────────────────────────────────────────────────────────
insert into public.event_types (id, group_id, code, label, has_duration, is_entry, has_person_attr) values
  (1, 1, 'enter',        'Enter',        false, true,  true),
  (2, 1, 'exit',         'Exit',         false, false, false),
  (3, 1, 'visitor',      'Visitor',      false, false, true),
  (4, 1, 'visitor_in',   'Visitor in',   false, true,  false),
  (5, 1, 'visitor_out',  'Visitor out',  false, false, false),
  (6, 1, 'pasante',      'Pasante',      false, false, false),
  (7, 1, 'pass_out',     'Pass out',     false, false, false),
  (8, 1, 'time_in_zone', 'Time in zone', true,  true,  false)
on conflict (id) do nothing;

-- ─── person_classes ────────────────────────────────────────────────────────
insert into public.person_classes (id, code, gender_code, age_group_code, gender_label, age_group_label, label, created_at) values
  (1, 'unknown_unknown',     'unknown','unknown',     'Desconocido','Desconocido',        'Desconocido',         '2026-03-12T22:47:06.100852-05:00'),
  (2, 'hombre_nino',         'hombre', 'nino',        'Hombre','Niño (0-9)',              'Hombre Niño',         '2026-03-12T22:47:06.100852-05:00'),
  (3, 'hombre_joven',        'hombre', 'joven',       'Hombre','Joven (10-29)',           'Hombre Joven',        '2026-03-12T22:47:06.100852-05:00'),
  (4, 'hombre_adulto',       'hombre', 'adulto',      'Hombre','Adulto (30-59)',          'Hombre Adulto',       '2026-03-12T22:47:06.100852-05:00'),
  (5, 'hombre_adulto_mayor', 'hombre', 'adulto_mayor','Hombre','Adulto mayor (60+)',      'Hombre Adulto mayor', '2026-03-12T22:47:06.100852-05:00'),
  (6, 'mujer_nino',          'mujer',  'nino',        'Mujer','Niño (0-9)',               'Mujer Niño',          '2026-03-12T22:47:06.100852-05:00'),
  (7, 'mujer_joven',         'mujer',  'joven',       'Mujer','Joven (10-29)',            'Mujer Joven',         '2026-03-12T22:47:06.100852-05:00'),
  (8, 'mujer_adulto',        'mujer',  'adulto',      'Mujer','Adulto (30-59)',           'Mujer Adulto',        '2026-03-12T22:47:06.100852-05:00'),
  (9, 'mujer_adulto_mayor',  'mujer',  'adulto_mayor','Mujer','Adulto mayor (60+)',       'Mujer Adulto mayor',  '2026-03-12T22:47:06.100852-05:00')
on conflict (id) do nothing;

-- ─── realinear las secuencias ──────────────────────────────────────────────
-- Obligatorio: se insertaron ids explícitos en columnas identity, así que la
-- secuencia sigue en 1 y el próximo insert sin id chocaría con la PK.
select setval(pg_get_serial_sequence('public.event_groups',  'id'), coalesce((select max(id) from public.event_groups),  1));
select setval(pg_get_serial_sequence('public.sites',          'id'), coalesce((select max(id) from public.sites),          1));
select setval(pg_get_serial_sequence('public.cameras',        'id'), coalesce((select max(id) from public.cameras),        1));
select setval(pg_get_serial_sequence('public.event_types',    'id'), coalesce((select max(id) from public.event_types),    1));
select setval(pg_get_serial_sequence('public.person_classes', 'id'), coalesce((select max(id) from public.person_classes), 1));
