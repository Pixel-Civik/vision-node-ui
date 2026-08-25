# Dataset revisado de shoplifting

La clasificación humana entra únicamente por el RPC
`review_shoplifting_alert`. La función comprueba que el MP4 privado esté listo,
copia su `video_bucket` y `video_object` dentro de la revisión y actualiza la
alerta en la misma transacción.

Mapeo de botones:

- `Confirmar sospechoso` → `decision=confirmed`, `training_label=suspicious`.
- `Descartar falso positivo` → `decision=dismissed`, `training_label=normal`.

`shoplifting_alert_reviews` es la bitácora inmutable. Una corrección posterior
crea una versión nueva; no sobrescribe la decisión previa.

El consumidor futuro de entrenamiento debe leer
`shoplifting_training_dataset` con una credencial **server-side** autorizada.
La vista devuelve solamente la última revisión elegible de cada alerta y el
ancla exacta al MP4. El proceso de IA debe usar esas dos columnas para leer GCS:

```sql
select alert_id, training_label, video_bucket, video_object,
       camera_id, occurred_at, model_risk_score, model_metadata
from public.shoplifting_training_dataset
order by reviewed_at;
```

El bucket continúa privado. No se deben copiar llaves de servicio ni rutas de
objetos a código cliente; un backend autorizado descarga el video o emite una
URL temporal. Las evidencias incompatibles con `h264-faststart-v1` no pueden
clasificarse mediante el RPC.
