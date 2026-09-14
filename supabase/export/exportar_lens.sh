#!/usr/bin/env bash
# ============================================================================
# Exportación de Lens usando SOLO la anon key. No requiere Owner.
# ============================================================================
#   ./exportar_lens.sh catalogos      -> sites, cameras, event_types, person_classes
#   ./exportar_lens.sh events         -> ~262k filas por keyset
#   ./exportar_lens.sh alerts         -> shoplifting_alerts (16 de 19 columnas)
#   ./exportar_lens.sh evidencia      -> catálogo alerta -> objeto GCS
#
# Requiere: SUPABASE_URL y SUPABASE_ANON_KEY en el entorno.
#
# Por qué keyset y no offset: los jobs de retención borran filas MIENTRAS se
# pagina. Con offset la ventana se desplaza y se pierden filas en silencio.
# Paginando por id ascendente el cursor es estable frente a borrados.
# ============================================================================
set -euo pipefail
: "${SUPABASE_URL:?falta SUPABASE_URL}"
: "${SUPABASE_ANON_KEY:?falta SUPABASE_ANON_KEY}"
U="$SUPABASE_URL/rest/v1"
H=(-H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY")
OUT="${OUT_DIR:-./export_out}"; mkdir -p "$OUT"
PAGE="${PAGE:-1000}"
MAX_PAGES="${MAX_PAGES:-0}"   # 0 = sin límite; útil para probar sin bajarlo todo

keyset() { # $1=tabla  $2=columna_id  $3=select  $4=salida
  local cursor="" total=0 n pages=0
  : > "$4"
  while :; do
    local q="$U/$1?select=$3&order=$2.asc&limit=$PAGE"
    [ -n "$cursor" ] && q="$q&$2=gt.$cursor"
    curl -sf "${H[@]}" "$q" > /tmp/_pg.json
    n=$(python3 -c "import json,sys;d=json.load(open('/tmp/_pg.json'));print(len(d))")
    [ "$n" -eq 0 ] && break
    python3 -c "
import json
for r in json.load(open('/tmp/_pg.json')): print(json.dumps(r))" >> "$4"
    cursor=$(python3 -c "
import json;d=json.load(open('/tmp/_pg.json'));print(d[-1]['$2'])")
    total=$((total+n)); pages=$((pages+1)); printf "\r  %s: %d filas (%d págs)" "$1" "$total" "$pages" >&2
    [ "$n" -lt "$PAGE" ] && break
    [ "$MAX_PAGES" -gt 0 ] && [ "$pages" -ge "$MAX_PAGES" ] && { echo " [corte por MAX_PAGES]" >&2; break; }
  done
  echo >&2
}

case "${1:-}" in
  catalogos)
    for t in sites cameras event_types person_classes event_groups alert_log; do
      curl -sf "${H[@]}" "$U/$t?select=*&order=id.asc" > "$OUT/$t.json" || echo "  $t: sin acceso" >&2
      echo "  $t -> $OUT/$t.json"
    done ;;
  events)
    keyset events id "*" "$OUT/events.ndjson" ;;
  alerts)
    # select=* falla: expande a columnas revocadas. Hay que listarlas.
    COLS="id,site,camera_id,camera_name,occurred_at,risk_score,risk_reasons,status,thumbnail_path,duration_sec,metadata,created_at,reviewed_at,video_status,video_uploaded_at,video_size_bytes"
    keyset shoplifting_alerts occurred_at "$COLS" "$OUT/shoplifting_alerts.ndjson" ;;
  evidencia)
    # video_bucket/video_object no son legibles como columnas, pero
    # resolve_shoplifting_evidence (STABLE, SECURITY DEFINER) los devuelve.
    : > "$OUT/evidencia.ndjson"
    python3 - "$OUT" <<'PYEOF'
import json,os,sys,urllib.request
from concurrent.futures import ThreadPoolExecutor
out=sys.argv[1]; U=os.environ['SUPABASE_URL']; K=os.environ['SUPABASE_ANON_KEY']
H={'apikey':K,'Authorization':'Bearer '+K,'Content-Type':'application/json'}
def req(path,data=None):
    r=urllib.request.Request(U+path, data=json.dumps(data).encode() if data else None, headers=H)
    return json.load(urllib.request.urlopen(r))

# Fuente: el export ya paginado. Consultar la API aquí sería un bug -- PostgREST
# limita a max_rows=1000 y truncaría en silencio.
src=out+'/shoplifting_alerts.ndjson'
if os.path.exists(src):
    alerts=[json.loads(l) for l in open(src)]
else:
    alerts=[]; cur=None
    while True:
        q='/rest/v1/shoplifting_alerts?select=id,camera_id,occurred_at,video_status&order=occurred_at.asc&limit=1000'
        if cur: q+='&occurred_at=gt.'+cur.replace('+','%2B')
        pg=req(q)
        if not pg: break
        alerts+=pg; cur=pg[-1]['occurred_at']
        if len(pg)<1000: break

ready=[a for a in alerts if a.get('video_status')=='ready']
lim=int(os.environ.get('MAX_EVID','0') or 0)
if lim: ready=ready[:lim]
print(f'  resolviendo evidencia de {len(ready)} alertas...',file=sys.stderr)

def resolve(a):
    try:
        ev=req('/rest/v1/rpc/resolve_shoplifting_evidence',
               {'p_alert_id':a['id'],'p_camera_id':a['camera_id'],'p_occurred_at':a['occurred_at']})
        return {'alert_id':a['id'], **(ev or {})}
    except Exception as e:
        return {'alert_id':a['id'],'error':str(e)[:120]}

n=0
with open(out+'/evidencia.ndjson','w') as f, ThreadPoolExecutor(max_workers=8) as ex:
    for r in ex.map(resolve, ready):
        f.write(json.dumps(r)+'\n'); n+=1
        if n%250==0: print(f'\r  evidencia: {n}/{len(ready)}',end='',file=sys.stderr)
print(f'\r  evidencia: {n} alertas procesadas',file=sys.stderr)
PYEOF
    ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac
