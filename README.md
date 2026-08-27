# Lens — Interfaz web de Pixel Civik

Dashboard de analítica de tráfico peatonal para retail. Consume los eventos que
el nodo de visión publica en Supabase y los presenta como indicadores, series
horarias, mapas de calor, embudos de conversión y reportes exportables.

Este repositorio contiene **únicamente la capa de presentación**. La detección,
el conteo y la publicación de eventos viven en
[`vision-node-core`](https://github.com/Pixel-Civik/vision-node-core).

---

## Índice

1. [Arquitectura](#arquitectura)
2. [Requisitos](#requisitos)
3. [Puesta en marcha](#puesta-en-marcha)
4. [Variables de entorno](#variables-de-entorno)
5. [Estructura del proyecto](#estructura-del-proyecto)
6. [Modelo de datos](#modelo-de-datos)
7. [Funciones RPC](#funciones-rpc)
8. [Sistema de alertas](#sistema-de-alertas)
9. [Despliegue](#despliegue)
10. [Flujo de trabajo con Git](#flujo-de-trabajo-con-git)
11. [Convenciones de código](#convenciones-de-código)
12. [Seguridad](#seguridad)
13. [Diagnóstico](#diagnóstico)

---

## Arquitectura

```
Cámaras IP (RTSP)
      |
      v
vision-node-core        Detección, tracking y conteo en el borde (Intel N100)
      |
      | INSERT de eventos
      v
Supabase / PostgreSQL   Almacenamiento + agregación vía funciones RPC
      |
      | PostgREST (HTTP)
      v
Lens (este repositorio) Next.js en Vercel
```

Decisión de diseño central: **la agregación ocurre en la base de datos, no en
el navegador**. El cliente pide un rango y recibe los datos ya calculados. Esto
mantiene el volumen transferido acotado, evita recalcular en cada render y
permite que la lógica de negocio sea única y verificable en SQL.

Las funciones RPC viven en [`supabase/functions/`](supabase/functions/) y se
aplican desde el editor SQL del panel de Supabase.

---

## Requisitos

| Componente | Versión           |
| ---------- | ----------------- |
| Node.js    | 20 LTS o superior |
| npm        | 10 o superior     |
| Next.js    | 16.2.6            |
| React      | 19.2.4            |
| TypeScript | 5                 |

Se requiere además acceso a un proyecto de Supabase con el esquema de eventos
ya creado y las funciones RPC aplicadas.

---

## Puesta en marcha

```bash
git clone https://github.com/Pixel-Civik/vision-node-ui.git
cd vision-node-ui
npm install
cp .env.local.example .env.local   # completar con las credenciales del proyecto
npm run dev
```

La aplicación queda disponible en `http://localhost:3000`.

### Comandos disponibles

| Comando                | Descripción                                            |
| ---------------------- | ------------------------------------------------------ |
| `npm run dev`          | Servidor de desarrollo con Turbopack y recarga en vivo |
| `npm run build`        | Compilación de producción                              |
| `npm run start`        | Sirve la compilación de producción                     |
| `npm run lint`         | Análisis estático con ESLint                           |
| `npx tsc --noEmit`     | Verificación de tipos sin generar archivos             |

Antes de abrir un Pull Request deben pasar `npm run build` y `npx tsc --noEmit`.

---

## Variables de entorno

Se declaran en `.env.local`, que **no se versiona**.

| Variable                        | Obligatoria | Descripción                                        |
| ------------------------------- | ----------- | -------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Sí          | URL del proyecto, `https://<ref>.supabase.co`      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí          | Clave pública (rol `anon`)                          |
| `GCP_PROJECT_ID`                | Videos      | `lens-506116`; solo servidor                        |
| `GCP_PROJECT_NUMBER`            | Videos      | `1039739275295`; solo servidor                      |
| `GCP_STORAGE_BUCKET`            | Videos      | `lens-506116-shoplifting-evidence`                  |
| `GCP_STORAGE_OBJECT_PREFIX`     | Videos      | `shoplifting/tienda`                                |
| `GCP_SERVICE_ACCOUNT_EMAIL`     | Videos      | Identidad de firma Vercel                           |
| `GCP_WORKLOAD_IDENTITY_POOL_ID` | Videos      | `vercel-shoplifting`                                |
| `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | Videos | `vercel-production-main`                         |

El prefijo `NEXT_PUBLIC_` expone la variable al navegador. Por eso aquí solo
puede usarse la clave `anon`, nunca `service_role`: esta última omite las
políticas de seguridad a nivel de fila (RLS) y publicarla equivaldría a dar
acceso total a la base de datos.

Las variables GCP no llevan `NEXT_PUBLIC_`: el Route Handler las usa para
generar enlaces privados de cinco minutos. En Vercel se activa OIDC con issuer
de equipo; no se almacena ninguna llave JSON. Para reproducir o clasificar una
alerta debe existir un usuario en `Supabase > Authentication > Users`; no se
habilita registro público porque daría acceso a evidencia sensible.

---

## Estructura del proyecto

```
src/
  app/
    layout.tsx           Layout raíz, tipografía y metadatos
    page.tsx             Contenedor de la aplicación: estado global de filtros
    providers.tsx        Frontera de cliente para TanStack Query
  components/
    layout/              Barra lateral, barra superior, navegación
    filters/             Selector de fechas, multiselección, panel de filtros
    sections/            Secciones de primer nivel de la aplicación
    dashboards/          Vistas especializadas por tipo de evento
    dashboard/           Paneles compuestos (KPIs, comparación, zonas)
    charts/              Gráficos individuales sobre Recharts
    export/              Diálogos de exportación a Excel y PDF
    ui/                  Primitivas de interfaz (shadcn / base-ui)
  hooks/                 Acceso a datos y estado derivado
  lib/
    supabase.ts          Cliente de Supabase y utilidades RPC
    api.ts               Capa de acceso a datos: una función por RPC
    types.ts             Contratos TypeScript compartidos
    fmt.ts               Formateo de números, horas y fechas
    exportExcel.ts       Generación de libros de Excel
    exportPDF.ts         Generación de reportes en PDF
supabase/functions/      Definiciones SQL y la Edge Function de alertas
```

### Secciones de la aplicación

| Sección     | Contenido                                                       |
| ----------- | --------------------------------------------------------------- |
| Inicio      | Resumen ejecutivo con los indicadores principales               |
| Reporte     | Vista analítica completa con filtros y exportación              |
| Entradas    | Análisis de entradas y salidas, con demografía                  |
| Visitantes  | Visitantes frente a pasantes y embudo de conversión             |
| TIZ         | Tiempo en zona: permanencia por área                            |
| Técnico     | Estado operativo, disponibilidad y diagnóstico                  |

### Hooks de datos

| Hook                    | Responsabilidad                                              |
| ----------------------- | ------------------------------------------------------------ |
| `useFilterOptions`      | Catálogos de filtro, días con datos y rango de apertura      |
| `useDashboard`          | Conjunto completo de datos del período seleccionado          |
| `useComparisonData`     | Comparación contra un período de referencia                  |
| `useAnalytics`          | Demografía y datos de tiempo en zona                         |
| `useTrendData`          | Series diarias para gráficos de tendencia                    |
| `useAvailability`       | Cobertura horaria por cámara                                 |
| `useUptime`             | Disponibilidad del sistema                                   |
| `useCameraLastEvents`   | Último evento registrado por cámara                          |
| `useDataFreshnessAlert` | Aviso en pantalla cuando deja de haber datos                 |

---

## Modelo de datos

La aplicación lee de `tracking_logs_view`, una vista que une `events` con las
tablas de dimensión `sites`, `cameras` y `event_types`.

### Tipos de evento

| Evento         | Origen habitual | Significado                                    |
| -------------- | --------------- | ---------------------------------------------- |
| `enter`        | Cámara de acceso | Una persona ingresó al local                   |
| `exit`         | Cámara de acceso | Una persona salió del local                    |
| `visitor`      | Puerta principal | Ingreso considerado visita efectiva            |
| `pasante`      | Puerta principal | Transitó frente a la puerta sin ingresar       |
| `time_in_zone` | Cámara interior  | Permanencia en una zona, con `dwell_sec`       |

La función `dashboard_event_norm` normaliza los códigos históricos
(`time_in_zone` a `visit`, `pass_out` a `pasante`, `visitor_in` y `visitor_out`
a `visitor`), de modo que el resto de las consultas trabaja con un vocabulario
único.

### Zona horaria

Todos los datos se almacenan en UTC y se presentan en **America/Lima
(UTC-5, sin horario de verano)**. La conversión se realiza en SQL mediante
`dashboard_local_ts`, de forma que un mismo rango produce siempre el mismo
resultado sin importar la zona horaria del navegador.

---

## Funciones RPC

Definidas en [`supabase/functions/dashboard_v7_server_logic.sql`](supabase/functions/dashboard_v7_server_logic.sql).

| Función                    | Devuelve | Propósito                                                     |
| -------------------------- | -------- | ------------------------------------------------------------- |
| `dashboard_overview`       | `jsonb`  | Indicadores, series horarias, zonas, canales, mapa de calor y TIZ en una sola llamada |
| `dashboard_compare`        | `jsonb`  | Período actual contra período de referencia, con variaciones ya calculadas |
| `dashboard_default_range`  | tabla    | Rango con el que abre el dashboard                            |
| `dashboard_data_days`      | tabla    | Días que efectivamente tienen datos                           |
| `dashboard_ref_period`     | tabla    | Resolución del período de referencia                          |
| `dashboard_filter_options` | tabla    | Sedes, canales y zonas disponibles                            |

### Rango de apertura

`dashboard_default_range` devuelve el **mes en curso**. Si el mes en curso aún
no registra eventos, retrocede automáticamente al último mes que sí los tuvo.
De este modo el dashboard nunca abre vacío ni carga el histórico completo.

### Períodos de referencia

La comparación selecciona la referencia sobre los días que **realmente tienen
datos**, saltando los períodos sin registro. Una interrupción del servicio ya
no produce comparaciones contra cero.

| Modo          | Referencia seleccionada                                          |
| ------------- | ---------------------------------------------------------------- |
| `prev-period` | Los N días con datos anteriores, donde N son los del período actual |
| `prev-month`  | El mes calendario anterior que tenga datos                       |
| `prev-day`    | El último día con datos previo al período                        |
| `same-dow`    | El día con datos más reciente del mismo día de la semana         |

`prev-period` es el modo por defecto. Las variaciones se entregan también
normalizadas por día con datos (`enters_per_day`, `pasantes_per_day`), lo que
permite comparar períodos de distinta duración operativa.

### Notas de rendimiento

Las funciones que recorren `events` declaran
`SET plan_cache_mode = 'force_custom_plan'`. Sin esa directiva PostgreSQL
reutiliza un plan genérico que, al desconocer la amplitud real del rango,
subestima las filas y elige un *nested loop* que vuelve a recorrer las tablas
de dimensión una vez por fila. La diferencia medida fue de 408.000 frente a
17.000 bloques leídos.

`dashboard_overview` agrega primero al grano mínimo (fecha, día de la semana,
hora, tipo de evento, canal y zona) y deriva de allí todos los indicadores.
Materializar las filas crudas excedía `work_mem` y provocaba escritura en disco.

---

## Sistema de alertas

Avisa por correo cuando el sistema deja de recibir eventos, lo que en la
práctica indica una caída de cámaras, de red o del nodo de visión.

| Componente        | Ubicación                                 |
| ----------------- | ----------------------------------------- |
| Edge Function     | `supabase/functions/check-freshness/`     |
| Tabla de registro | `supabase/functions/alert_log.sql`        |
| Programación      | `supabase/functions/cron_setup.sql`       |

### Comportamiento

- Se ejecuta cada 5 minutos mediante `pg_cron`.
- Solo actúa entre las 07:00 y las 21:00 hora de Lima.
- Envía la primera alerta tras **20 minutos** sin eventos.
- Reitera cada **15 minutos** mientras la condición persista.
- Al reanudarse el flujo marca `resolved_at` y deja de notificar.
- La referencia es `max(último evento, 07:00 de hoy)`, para no alertar de
  madrugada por los datos de la jornada anterior.

### Variables requeridas en la Edge Function

| Variable                    | Descripción                                  |
| --------------------------- | -------------------------------------------- |
| `SUPABASE_URL`              | URL del proyecto                             |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio, necesaria para escribir   |
| `RESEND_API_KEY`            | Clave de la API de Resend                    |
| `ALERT_FROM_EMAIL`          | Remitente                                    |
| `ALERT_TO_EMAIL`            | Destinatarios, separados por coma            |

### Verificación

```sql
-- Estado de la tarea programada
SELECT jobname, schedule, active FROM cron.job;

-- Últimas ejecuciones
SELECT start_time, status, return_message
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'check-data-freshness')
ORDER BY start_time DESC LIMIT 10;

-- Alertas registradas
SELECT * FROM alert_log ORDER BY sent_at DESC LIMIT 10;
```

Si la tarea aparece con `active = false` no se está vigilando nada. Para
reactivarla:

```sql
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'check-data-freshness'),
  active := true
);
```

---

## Despliegue

El proyecto se despliega en Vercel. La rama `main` corresponde al entorno de
producción; cada Pull Request genera un despliegue de vista previa.

Las variables públicas de Supabase y las seis variables GCP de la tabla deben
estar definidas en Vercel. La confianza OIDC de producción se restringe al ID
inmutable del proyecto Vercel y al entorno `production`.

Las funciones SQL **no se despliegan junto con la aplicación**. Al incorporar
cambios en `supabase/functions/*.sql` hay que aplicarlos manualmente en el
editor SQL de Supabase; conviene hacerlo antes de fusionar el Pull Request que
depende de ellos.

---

## Flujo de trabajo con Git

Se adopta GitFlow. Las ramas permanentes son:

| Rama      | Propósito                                                     |
| --------- | ------------------------------------------------------------- |
| `main`    | Refleja exactamente lo que está en producción. Solo recibe fusiones desde `release/*` y `hotfix/*`. |
| `develop` | Rama de integración. Reúne el trabajo terminado a la espera de la próxima entrega. |

Las ramas temporales siguen esta nomenclatura:

| Prefijo     | Nace de   | Se fusiona en      | Uso                              |
| ----------- | --------- | ------------------ | -------------------------------- |
| `feature/`  | `develop` | `develop`          | Funcionalidad nueva              |
| `fix/`      | `develop` | `develop`          | Corrección sin urgencia          |
| `release/`  | `develop` | `main` y `develop` | Preparación de una entrega       |
| `hotfix/`   | `main`    | `main` y `develop` | Corrección urgente en producción |

### Ciclo habitual

```bash
git checkout develop
git pull origin develop
git checkout -b feature/comparacion-mensual

# ... trabajo, con commits pequeños y descriptivos ...

npm run build && npx tsc --noEmit    # debe pasar antes de publicar
git push -u origin feature/comparacion-mensual
# Abrir Pull Request contra develop
```

### Entrega a producción

```bash
git checkout -b release/1.4.0 develop
# ajustes finales de versión y documentación
git checkout main && git merge --no-ff release/1.4.0
git tag -a v1.4.0 -m "Comparación por períodos y carga en una sola consulta"
git checkout develop && git merge --no-ff release/1.4.0
git push origin main develop --tags
```

### Mensajes de commit

Formato: `<tipo>: <descripción en imperativo>`, con la primera línea en 72
caracteres o menos.

Tipos admitidos: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `chore`.

```
feat: comparación contra el período anterior con datos
fix: evitar lectura de ref durante el render en page.tsx
perf: agregar al grano mínimo en dashboard_overview
docs: documentar el sistema de alertas de frescura
```

El cuerpo del commit debe explicar **por qué** se hace el cambio. El qué ya
está en el diff.

### Estado actual del repositorio

Hoy solo existe la rama `main`. Para adoptar el flujo descrito:

```bash
git checkout -b develop main
git push -u origin develop
```

A continuación conviene configurar `develop` como rama por defecto en GitHub y
proteger `main` exigiendo Pull Request y revisión.

---

## Convenciones de código

- **TypeScript estricto.** No se admite `any` implícito ni la supresión de
  errores con `@ts-ignore`.
- **Comentarios que explican decisiones, no mecánica.** Un comentario debe
  responder por qué el código es así, en especial cuando la alternativa
  evidente no funcionó. Los comentarios que se limitan a repetir la línea
  siguiente sobran.
- **Los cálculos de negocio van en SQL.** Si aparece la necesidad de agregar,
  promediar o comparar en el cliente, corresponde evaluar primero si debe
  resolverse en una función RPC.
- **Acceso a datos centralizado.** Todo pasa por `src/lib/api.ts`. Los
  componentes no invocan `supabase.rpc` directamente.
- **Estado del servidor con TanStack Query.** No se replica en `useState` lo
  que ya administra la caché de consultas.
- **Nomenclatura.** Componentes en `PascalCase`, hooks con prefijo `use`,
  utilidades en `camelCase`, funciones SQL con prefijo `dashboard_`.

---

## Seguridad

- `.env.local` y todo archivo `.env*` están excluidos del control de versiones.
- En el navegador solo puede usarse la clave `anon`. La clave `service_role`
  se limita a las Edge Functions, donde no queda expuesta al cliente.
- Las escrituras del nodo de visión emplean `service_role` porque las
  políticas RLS bloquean las inserciones con la clave `anon`.

### Punto pendiente de atención

El archivo `.mcp.json` está versionado y contiene un token de acceso personal
de Supabase en texto plano. Un token de este tipo permite administrar el
proyecto por completo. Se recomienda:

1. Revocar el token desde *Account → Access Tokens* en el panel de Supabase.
2. Retirar el archivo del control de versiones y añadirlo a `.gitignore`:
   ```bash
   git rm --cached .mcp.json
   echo ".mcp.json" >> .gitignore
   git commit -m "chore: retirar .mcp.json del control de versiones"
   ```
3. Tener presente que el token permanece accesible en el historial de Git. La
   revocación del paso 1 es, por lo tanto, indispensable.

---

## Diagnóstico

### El dashboard abre sin datos

Verificar en este orden:

1. Que el nodo de visión esté publicando:
   `SELECT max(time) FROM events;`
2. Que las variables de entorno apunten al proyecto correcto.
3. Que las funciones RPC estén aplicadas:
   `SELECT proname FROM pg_proc WHERE proname LIKE 'dashboard_%';`

### La carga es lenta

Comprobar la amplitud del rango seleccionado. El rango de apertura corresponde
a un mes; seleccionar manualmente varios meses multiplica el volumen. Para
medir el costo real de una consulta:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT dashboard_overview('2026-08-01T05:00:00Z', '2026-08-31T23:59:59Z');
```

### La comparación aparece sin valores

Indica que no existe un período de referencia con datos anterior al
seleccionado. Puede confirmarse con:

```sql
SELECT * FROM dashboard_ref_period(
  '2026-08-01T05:00:00Z', '2026-08-31T23:59:59Z', 'prev-period');
```

Si `found` es `false`, no hay datos previos con los que comparar.

### Los gráficos quedan en blanco sin mostrar error

Revisar la consola del navegador. Un fallo de RPC se propaga como error de
TanStack Query y se refleja en el aviso superior de la sección; un gráfico
vacío sin error suele indicar que el período no contiene ese tipo de evento.

---

## Licencia

Software propietario. Pixel Civik. Todos los derechos reservados.
