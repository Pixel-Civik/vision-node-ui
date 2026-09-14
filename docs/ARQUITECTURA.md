# Arquitectura de Lens

Estado verificado el **14 de septiembre de 2026**, después de migrar el sistema
fuera del proyecto Supabase del practicante.

Todo lo de aquí se comprobó contra la infraestructura viva: consultas a
Postgres, logs de ambos contenedores, peticiones reales del dashboard y
registros de ejecución de los crons. No está tomado del código.

> Versión renderizada con diagrama: https://claude.ai/artifact/JoTSESAjokvNQsNDik51qR
> Este archivo es la fuente; si divergen, gana este.

## El flujo

```
EN LA TIENDA                 SUPABASE (us-east-1)            CONSUMIDORES

Jetson ──── alertas ───────► tablas (RLS cerrada)
  │                          18 RPC SECURITY DEFINER ──────► Dashboard
  │                          pg_cron                          lens.pixelcivik.com
  │                            └─► Edge Function ───────────► Correo (Resend)
  │
  └──── video MP4 ──────────► Google Cloud Storage ◄─ URL firmada ─┘

N100 ──── eventos + telemetría ─► tablas
```

Los dos caminos no se cruzan hasta la base. El dashboard **nunca lee tablas
directamente**: todo pasa por funciones `SECURITY DEFINER`. El video se sirve
por URL firmada de GCS, nunca desde Supabase.

## Responsabilidades

| Pieza | Hace | Escribe en | Acceso |
|---|---|---|---|
| **N100** `miraflores1-n100-01` | Conteo de personas sobre RTSP | `events`, `edge_node_metrics` | `ssh freshmart` |
| **Jetson** `miraflores1-jetson-01` | Detección de hurto | `shoplifting_alerts`, GCS | `ssh jetson` |
| **Supabase** `jtdnfockogskhuoturht` | 13 tablas, 2 vistas, 18 RPC, 2 crons | — | org `signal Org`, cuenta UTEC |
| **Dashboard** | Next.js en Vercel, sin login | — | `lens.pixelcivik.com` |
| **GCS** `lens-506116-shoplifting-evidence` | Videos y miniaturas de evidencia | — | proyecto GCP de PixelCivik |
| **Resend** | Único canal de aviso de caída | — | `alertas@pixelcivik.com` |

El N100 escribe con `service_role`; el Jetson con la clave secreta. Ambos
tienen cola durable en disco: si la base cae, encolan y reintentan.

## Datos

| Tabla | Filas | Tamaño | La escribe | Retención |
|---|---|---|---|---|
| `events` | 260 088 | 67 MB | N100 | 3 meses |
| `shoplifting_alerts` | 3 379 | 13 MB | Jetson | 3 meses |
| `edge_node_metrics` | 168 | 384 kB | Ambos | 30 días |
| `edge_nodes` | 2 | 336 kB | Ambos | permanente |
| `shoplifting_alert_reviews` | 18 | 40 kB | Revisión humana | permanente |
| catálogos | 2·6·8·1·9 | 32 kB c/u | Sembrado | permanente |

**La retención no es reversible.** El cron de las `:17` borra cada hora lo que
pasa de tres meses, y no hay copia fuera de la base.

## Cámaras

| Canal | Equipo | Rol | Volumen | Estado |
|---|---|---|---|---|
| 101 | N100 | Conteo | 247 545 eventos | Activa · **95% del tráfico** |
| 701 | N100 | Conteo | 13 311 eventos | Activa |
| 1101 | Jetson | Hurto | 2 476 alertas | Activa |
| 801 | Jetson | Hurto | 922 alertas | Activa |
| 1401 | N100 | Conteo | **0 eventos** | **Configurada pero inerte** |
| 501 · 1301 · 901 | — | Conteo | 0 eventos | En el catálogo, sin uso |

Un canal necesita **tres** cosas para activarse: `RTSP_URL_<canal>` en `.env`,
figurar en `channels` de `config/config_edge_stream.yaml`, y un
`configs/<canal>/zones.json` con `"enabled": true`. La 1401 tiene la primera y
la tercera; falta la del medio, así que el equipo la ignora **sin error, sin
log y sin alerta**.

## Seguridad

1. La anon key es pública por diseño: viaja en el bundle del navegador.
2. Con ella no se lee **ninguna** tabla — las 13 devuelven cero filas.
3. Las RPC sí devuelven datos, porque son `SECURITY DEFINER`. Exponen
   agregados, no el histórico crudo.
4. **Las vistas eran la puerta lateral.** Una vista de Postgres corre con los
   privilegios de su dueño, no del invocador, así que `tracking_logs_view`
   salteaba la RLS y exponía 260 mil filas con `track_id`, `gender` y `age`.
   Cerrada con `security_invoker` en `20260914000000`.

Excepción deliberada: `shoplifting_alerts` sí se lee con la anon key porque el
panel de alertas lo necesita. Las columnas con la ruta cruda del video están
revocadas; el archivo se sirve siempre por URL firmada.

## Puntos frágiles

- **Dos vocabularios de sede.** El N100 escribe `site_id` contra el catálogo
  `sites`; el Jetson escribe `site` como texto libre (`"tienda"`), sin clave
  foránea. Cruzar conteo y hurto por sede exige hoy un mapeo a mano.
- **Un solo canal de aviso.** Si Resend falla, nadie se entera de una caída. La
  Edge Function registra `email_not_configured` y sigue, sin error visible.
- **Despliegue del edge manual.** Ambos equipos corren `main` y ya pueden hacer
  `git pull`, pero nada lo dispara solo.
- **El 95% del conteo depende de la cámara 101.** Si se cae, el sistema sigue
  "vivo" pero pierde casi todo su volumen.
