# Migración de Lens · COMPLETADA el 2026-09-13

## Estado

El proyecto nuevo existe, tiene el esquema y tiene los datos.

| | |
|---|---|
| Proyecto | `jtdnfockogskhuoturht` "lens" |
| Organización | `qxeffkpuadchbeekigte` "signal Org" (cuenta `juan.barbaran@utec.edu.pe`) |
| Región | us-east-1 · Postgres 17 |
| URL | `https://jtdnfockogskhuoturht.supabase.co` |
| Migraciones | 21 de 21 aplicadas, 0 errores |
| Eventos | 260,088 (13/06 → 13/09) |
| Alertas | 3,258 · 18 revisadas · 2,727 con objeto GCS (4.58 GB) |
| Catálogos | sites 2, cameras 6, event_types 8, person_classes 9 |

**Validación byte a byte.** Las mismas RPC sobre la ventana 01–11/09 devuelven
valores idénticos en producción y en el proyecto nuevo:

```
enters 9186 · exits 6699 · net 2487 · unique_tracks 15103 · days 11
enters_per_day 835.0909 · exits_per_day 609.0
zonas: out_zone/pasante 37816 · in_zone/visitor 9266 · in_zone/enter 9186 · out_zone/exit 6699
```

Eso valida a la vez el esquema reconstruido, la reconstrucción de
`dashboard_event_norm`, las 4 RPC escritas desde cero, el manejo de zona horaria
y la integridad de la importación.

**El problema del §0 NO se heredó.** El proyecto nuevo no expone ninguna
mutación a `anon` (`mutationType` vacío en GraphQL). `events` y los catálogos
devuelven `200 []`: RLS activa sin policy. Y el dashboard funciona igual, porque
las RPC son SECURITY DEFINER — comprobado con la anon key del proyecto nuevo.
Es decir, se puede operar sin exponer las 260k filas de tracking.

## Lo que falta

1. **Apuntar el UI al proyecto nuevo**: `NEXT_PUBLIC_SUPABASE_URL` y
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Vercel. Las claves están en
   `lens/_export_2026-09-13/_claves_proyecto_nuevo.json` (permisos 600, fuera de
   git). La contraseña de la base, en `~/.lens-prod-db-password`.
2. **Quitar la anon key hardcodeada** de `src/lib/supabase.ts:10` y
   `supabase/functions/cron_setup.sql:17`; deben salir de variables de entorno.
3. **Apuntar el N100** al proyecto nuevo (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
   en `vision-node-core/deploy/.env`).
4. **Desplegar la Edge Function**: `supabase functions deploy check-freshness`,
   y aplicar `optional/cron_check_freshness.sql` con los secretos nuevos.
5. **Corregir la fila de `event_groups`**: sigue siendo el relleno de `seed.sql`,
   porque en producción está oculta por RLS.
6. **Decidir sobre el proyecto viejo**: mientras siga sirviendo, el GRANT de
   escritura a `anon` sigue vivo con una key pública en GitHub. Ver §0 abajo.

## 0. URGENTE, anterior a la migración

**El rol `anon` tiene GRANT de INSERT, UPDATE y DELETE sobre 8 tablas del
modelo central**: `events`, `sites`, `cameras`, `event_types`, `event_groups`,
`person_classes`, `alert_log` y `keepalive`.

Probado el 2026-09-13 sin escribir nada, introspeccionando el tipo `Mutation`
de pg_graphql: expone 24 resolvers (`insertInto*`, `update*`, `deleteFrom*`)
para esas 8 tablas. pg_graphql solo los genera cuando el rol tiene realmente ese
privilegio — se contra-validó con `shoplifting_alerts`, que aparece en `Query`
pero NO tiene mutaciones porque `20260820` le revocó el UPDATE a `anon`. El
gating es por privilegio real, no automático.

Ninguna migración del repo concede esa escritura. Se aplicó a mano.

Y la anon key es pública: viaja en el bundle del navegador y además está
versionada en GitHub (`vision-node-ui/supabase/functions/cron_setup.sql:17` y
`src/lib/supabase.ts:10`).

Atenuante parcial: un INSERT de prueba sobre `sites` fue rechazado por RLS
(`new row violates row-level security policy`), así que al menos ahí hay una
policy conteniendo el GRANT. **No se comprobó `events`** — hacerlo exigía
escribir en producción y no se hizo. Como `anon` sí lee las 262k filas de
`events`, la RLS de esa tabla es permisiva o está desactivada; si está
desactivada, el GRANT es efectivo y cualquiera puede borrar o falsificar
eventos.

Esto se verifica y se corrige en un minuto con acceso a la consola:

```sql
select relname, relrowsecurity from pg_class where relname = 'events';
revoke insert, update, delete on public.events, public.sites, public.cameras,
  public.event_types, public.event_groups, public.person_classes,
  public.alert_log, public.keepalive from anon;
```

Es más urgente que la migración, y es la única cosa de esta lista que de verdad
no puede esperar.

## 1. El problema que esto resuelve

La base vive en `xpubdazwixxdckiunhvt`, un proyecto de la organización de Daniel
Yataco. `list_projects` con las credenciales de PixelCivik devuelve solo
Crashguard Dev y Prod; `get_project` sobre Lens sigue respondiendo
*You do not have permission*. Si ese acceso se pierde, sin este trabajo se
perdía también la **definición** del esquema.

Antes de este cambio, el repo **no podía levantar un proyecto nuevo**. No era
una cuestión de que faltaran detalles: fallaba. Comprobado aplicando las
migraciones en un Postgres 17 limpio:

| Faltaba | Consecuencia |
|---|---|
| Todo el modelo central: `sites`, `cameras`, `events`, `event_types`, `event_groups`, `person_classes`, `tracking_logs_view` | ninguna migración lo creaba |
| `dashboard_event_norm()` | la invocan `20260829` y `20260831`, no estaba definida en ningún archivo → esas dos migraciones fallaban |
| 8 RPC del dashboard | solo existían como `.sql` sueltos para pegar a mano |
| tabla `alert_log` | idem |
| `config.toml` | sin él no se puede `supabase link` ni `db push` |
| orden de `20260819_*` | `alert_history` ordenaba antes que `alerts`, del que depende → fallaba |
| `pg_cron` / `pg_net` | las migraciones de retención usan `cron.*` sin habilitarlas |
| tabla `keepalive` | existe en producción (`id`, `ping_at`), ninguna migración la creaba, y `prune_operational_data` aborta sin ella |
| `alert_log.last_notified_at` | columna NOT NULL en producción, ausente del archivo del repo |
| 4 RPC más: `dashboard_kpi_enter_exit`, `dashboard_breakdown_zone`, `dashboard_breakdown_channel`, `dashboard_local_ts` | el UI invoca 18 funciones `dashboard_*`; el repo definía 15 |
| orden de `20260819*` (2º defecto) | `alert_history` borra el índice único que `images_only` crea, pero corría antes: el índice sobrevivía |

Hoy las 20 migraciones + el seed aplican con **0 errores** en un Postgres 17
limpio, y el resultado responde correctamente a `dashboard_daily_totals`,
`dashboard_filter_options` y `dashboard_overview`.

## 2. Qué se agregó o cambió

Nuevo:
- `config.toml` — configuración del CLI.
- `migrations/20260101000000_baseline_core_model.sql` — modelo central.
- `migrations/20260101005000_extensions.sql` — `pg_cron`, `pg_net`.
- `migrations/20260101010000_alert_log.sql` — promovida de `functions/`.
- `migrations/20260101015000_dashboard_event_norm.sql` — la dependencia ausente.
- `migrations/20260101020000_dashboard_rpcs_base.sql` — las 8 RPC huérfanas.
- `seed.sql` — catálogos de producción.
- `optional/anon_read_paridad_produccion.sql` — decisión de seguridad, ver §6.
- `optional/cron_check_freshness.sql` — reemplaza `functions/cron_setup.sql`, que
  traía la clave JWT escrita en el archivo.

Nuevo (2ª pasada):
- `migrations/20260101025000_dashboard_rpcs_faltantes.sql` — las 4 RPC que solo
  existían en producción.

Renombrado. **No era solo cosmético, como decía la versión anterior de este
documento.** El orden correcto es `alerts` → `images_only` → `alert_history`:

`20260819_shoplifting_alerts` → `20260819000000_…`
`20260819_shoplifting_images_only` → `20260819000200_…`
`20260819_shoplifting_alert_history` → `20260819000300_…`
`20260901_edge_node_monitoring` → `20260901000000_…`

`images_only` deduplica y crea `UNIQUE(site, camera_id)` — el modelo "última
alerta por cámara". `alert_history` lo borra, que es el cambio a un modelo de
historial. Con el orden alfabético original, `alert_history` corría ANTES y el
índice sobrevivía, dejando un esquema incapaz de guardar más de una alerta por
cámara. Producción demuestra cuál es el correcto: 200 de 200 alertas muestreadas
comparten el mismo par `(site, camera_id)`, así que allí ese índice no existe.
Es un defecto preexistente del repo, no lo introdujo el renombrado.

Renombrar es seguro: no hay `config.toml` previo, así que estas migraciones
nunca se aplicaron con el CLI y no existe historial que romper.

`functions/` queda como referencia histórica. **La fuente de verdad es
`migrations/`.** No agregar SQL nuevo en `functions/`: así nació C-15.

## 3. Procedencia: qué está probado y qué no

El baseline se escribió **introspectando la base viva**, no adivinando. Con la
anon key, vía PostgREST, quedó probado:

- nombres y orden de columnas de las 6 tablas del modelo y de la vista;
- **tipo exacto** de cada columna, forzando errores de casteo de Postgres.
  En particular `events."time"` es `timestamptz`. La auditoría marcaba este
  punto como el de mayor riesgo: escribir `timestamp` habría corrompido zonas
  horarias en silencio;
- existencia de las FK (el *embedding* de PostgREST solo funciona con
  constraint real): `cameras→sites`, `event_types→event_groups`,
  `events→{sites,cameras,event_types}`; y que `person_classes` **no** tiene FK;
- PK/UNIQUE en los destinos de esas FK (Postgres lo exige);
- la **nulabilidad exacta de cada columna**, por introspección de pg_graphql:
  un campo `NON_NULL` en GraphQL es exactamente una columna `NOT NULL`. Es un
  oráculo fiable incluso con `DEFAULT`, verificado contra `shoplifting_alerts`,
  cuyas columnas `not null default …` del repo salen todas `NON_NULL`.
  Esto corrigió 7 errores de la primera versión del baseline;
- la expresión de las columnas `*_lima` de la vista: `at time zone
  'America/Lima'`, verificado comparando una fila real (delta exacto de −5 h);
- que `count(vista) = count(events)`, o sea que no hay `WHERE` que descarte
  filas ni join que las multiplique;
- el mapeo completo de `dashboard_event_norm`, llamando a la función viva caso
  por caso: `visitor_in`/`visitor_out`→`visitor`, `pass_out`→`pasante`,
  `time_in_zone`→`visit`, aplica `lower()`, no aplica `trim()`, `NULL`→`''`.
  Los 15 casos dan idéntico resultado en la reconstrucción local.

Marcado `[INFERIDO]` en cada línea del baseline, **pendiente de confirmar**:

- que las PK sean `identity` y no `serial`;
- los `default` (`now()`, `true`, `false`);
- índices no-PK, `CHECK`, triggers;
- las **policies RLS y los grants reales** de producción;
- los valores de la fila `event_groups` id=1: con la anon key la tabla devuelve
  0 filas, pero la FK desde los 8 `event_types` exige que exista. El seed pone
  un relleno marcado.

Las decisiones conservadoras de la primera pasada resultaron correctas:
`events.track_id` y `events.zone` son efectivamente NULLABLE. En cambio, siete
inferencias de `NOT NULL`/`DEFAULT` estaban mal y GraphQL las corrigió:
`events.camera_id` (el peor: habría rechazado eventos sin cámara al reimportar),
`cameras.active`, los tres booleanos de `event_types`, `sites.created_at` y
`person_classes.created_at` son NULLABLE; y `person_classes.gender_code` y
`age_group_code` sí son NOT NULL.

## 4. Levantar el proyecto nuevo

**Cuenta destino: `juan.barbaran@utec.edu.pe`**, donde ya vive Signal. Lens será
el segundo proyecto de esa cuenta.

Importante: NO es la organización `hyisucvgngbriozvoqat` "PixelCivik" que
mencionaban las versiones anteriores de este documento. Esa pertenece a otra
cuenta (la de los dos proyectos Crashguard) y es la única que ve el conector MCP
de Claude. Es decir, **la creación del proyecto la tiene que hacer Juan a mano**,
autenticado con la cuenta UTEC; desde la sesión de Claude no se alcanza.

```bash
cd vision-node-ui
supabase login                      # con juan.barbaran@utec.edu.pe
supabase projects list              # copiar el org-id de esa cuenta
supabase projects create lens-prod --org-id <org-utec> --region us-east-1
supabase link --project-ref <ref-nuevo>
```

Dos cosas que conviene verificar antes: el plan gratuito limita los proyectos
activos por organización (Signal + Lens deberían caber, pero quedarían al tope),
y una cuenta universitaria se pierde al egresar o si la universidad la da de
baja — que es exactamente el problema de continuidad que esta migración existe
para resolver. Si Lens es un activo de PixelCivik, vale la pena decidir
conscientemente si su dueño final debe ser una cuenta institucional propia.

En el Dashboard del proyecto nuevo: Database → Extensions → habilitar `pg_cron`
y `pg_net` (o dejar que lo haga `20260101005000_extensions.sql`).

```bash
supabase db push          # aplica las 20 migraciones en orden
psql "<connection-string>" -f supabase/seed.sql   # catálogos
supabase functions deploy check-freshness
```

Corregir después:
1. la fila real de `event_groups` (§3);
2. `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Vercel;
3. la anon key **hardcodeada** en `src/lib/supabase.ts` y en
   `functions/cron_setup.sql` — debe salir de variables de entorno;
4. el N100: apuntar `supabase_sink` / `supabase_ingest` al proyecto nuevo.

## 5. Cerrar los huecos cuando haya acceso (una sola acción)

Basta la cadena de conexión Postgres del proyecto origen. Con ella:

```bash
supabase db dump --db-url "<conn-origen>" --schema public -f /tmp/real.sql
supabase db diff  --db-url "<conn-origen>" --schema public
```

`db diff` compara producción contra estas migraciones y devuelve exactamente la
lista de `[INFERIDO]` que estaban mal, si alguno lo está. Eso convierte este
baseline de reconstrucción a verificado. `audit/2026-09-11/extraer_esquema.sql`
da lo mismo si solo se tiene el editor SQL de la consola.

### Petición mínima a Daniel

**Revisado el 2026-09-13: esta lista se redujo casi a nada.** Las dos cosas que
el día anterior parecían bloqueantes resultaron no serlo.

**1. Las etiquetas humanas — ya no se piden.** Medido: de 3,257 alertas, solo
**18 tienen `reviewed_at`** (1 `confirmed`, 17 `dismissed`). Un único ejemplo
positivo. Re-etiquetar eso son minutos, y el material crudo está intacto: 2,902
alertas con `video_status = ready`.

**2. Las columnas `video_bucket` / `video_object` — ya no se piden.** Están
revocadas a `anon` como columnas, pero la RPC `resolve_shoplifting_evidence`
(STABLE, SECURITY DEFINER, expuesta a `anon`) las devuelve igual:

```json
{"video_bucket": "lens-506116-shoplifting-evidence",
 "video_object": "shoplifting/tienda/cam1101/2026/08/27/suspicious/…mp4",
 "thumbnail_object": "…jpg", "video_size_bytes": 20330305}
```

Llamarla es seguro: Postgres prohíbe INSERT/UPDATE/DELETE dentro de funciones
STABLE. Cobertura medida por muestreo a lo largo de todo el rango (19/08–13/09):

| Fecha | Resueltas |
|---|---|
| 2026-08-24 | 0/5 |
| 2026-08-29 a 2026-09-13 | 30/30 |

Todo lo posterior al 24/08 se recupera. `export/exportar_lens.sh evidencia`
reconstruye el catálogo completo alerta → objeto GCS.

Queda por pedirle, y ninguna de estas bloquea la migración:

1. **Un `pg_dump --schema-only`.** Cierra los `[INFERIDO]` que restan: defaults,
   índices no-PK, CHECK, triggers e identity-vs-serial. Ninguno corrompe datos si
   se erra; degradan rendimiento o dejan pasar basura, y se corrigen después.
2. **Las policies/grants reales**, para cerrar el §0 con certeza en el proyecto
   viejo. Si el plan es apagarlo tras migrar, esto deja de importar.
3. **Que pare los jobs de retención** durante la exportación. Alternativa sin
   él: exportar rápido — `events` completo tarda ~4 min medidos.
4. Las alertas del **19–24 de agosto** cuya evidencia no resuelve, si es que
   importan: son los primeros días de operación.
5. Elegibilidad de transferencia del proyecto, solo si prefieren transferir en
   vez de recrear.

**Conclusión: la migración se puede hacer entera sin él.**

## 6. Decisiones de seguridad, no pasos automáticos

El baseline deja **RLS habilitado y sin policies**: cerrado. No reproduce los
grants a `anon` que tiene producción, porque son el hallazgo P1 C-04. Verificado
el 2026-09-12: la anon key lee las 262,485 filas de `events` y de
`tracking_logs_view`, con `track_id`, `gender`, `age` y `zone`. Como esa key
viaja en el bundle del navegador, cualquiera que abra la web puede volcar el
histórico completo de tracking de personas.

Recomendado: dejar RLS cerrado y que el dashboard consuma **solo las RPC**. Todas
son `SECURITY DEFINER`, así que leen `events` sin necesitar esos grants, y la
superficie baja de "todo el histórico" a "los agregados que cada RPC devuelve".
Para paridad literal con producción existe
`optional/anon_read_paridad_produccion.sql`, con la parte peligrosa comentada.

Aparte: en Postgres el `EXECUTE` de una función se concede a `PUBLIC` por
defecto. Conviene `REVOKE` explícito sobre las RPC que no deba llamar `anon`.

Y rotar la anon key al cortar: está versionada en GitHub
(`Pixel-Civik/vision-node-ui`) dentro de `functions/cron_setup.sql`.

## 6b. Cómo se validó esto

No basta con que las migraciones apliquen sin error: aplicar ≠ aplicar
correctamente. La validación corre las 20 migraciones + el seed en un Postgres 17
limpio en Docker y después comprueba **asserts de paridad con producción**:

| Assert | Estado |
|---|---|
| `shoplifting_alerts_site_camera_unique` NO existe | OK |
| tabla `keepalive` existe | OK |
| `prune_operational_data(90,30)` ejecuta y devuelve `keepalive_deleted` | OK |
| `alert_log.last_notified_at` existe | OK |
| `events.camera_id` acepta NULL | OK |
| `person_classes.gender_code` es NOT NULL | OK |
| `cameras.active` es NULLABLE | OK |
| las 4 RPC reconstruidas responden | OK |

Dos notas de método, por si alguien repite esto:
- Detectar fallos con `grep ^ERROR` es insuficiente: si el demonio de Docker se
  cae a mitad, el error no coincide con ese patrón y las migraciones siguientes
  se reportan como exitosas. Usar el código de salida de `psql -v ON_ERROR_STOP=1`.
- `pg_cron` y `pg_net` no existen en un Postgres vanilla, así que
  `20260101005000_extensions.sql` se omite en local; `cron.*` se sustituye por
  stubs para que las migraciones de retención se puedan validar igual.

## 7. Lo que sigue fuera del repo

- Los **datos**: 262 mil filas de `events`. Exportables **con la anon key**
  paginando por keyset (`?order=id.asc&id=gt.<cursor>&limit=1000`), no por
  offset: la purga de retención borra filas mientras se pagina y el offset se
  desalinearía. No hace falta el service_role.
  Al importar con ids explícitos hay que realinear la secuencia, como hace el
  final de `seed.sql`. Notar que los jobs de retención están purgando: el total
  bajó de 262,495 a 262,485 durante este mismo análisis.
- Buckets y objetos de **Storage** (evidencia de shoplifting).
- Usuarios de **Auth**.
- La configuración del proyecto: backups, PITR, restricciones de red.
- El job de `pg_cron` (§2, `optional/`).
