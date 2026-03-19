# vision-node-ui

## Dashboard (Streamlit)

Este mini dashboard lee los JSON generados por `vision-node/server`:

- JSON global para dashboard: `tracking_logs.json` (array de eventos enter/exit)
- JSON por-video (opcional): `events.json` (si el servidor lo habilita)

### Ejecutar local

Desde `vision-node/frontend`:

```bash
python -m venv .venv
source .venv/Scripts/activate
pip install -r requirements.txt
streamlit run app.py
```

### Fuentes soportadas

- Ejemplo incluido (por defecto)
- Subir archivo JSON
- Ruta local a un JSON (útil si tienes el blob descargado)
- URL HTTP/HTTPS (útil para SAS/publica)

### Enlace soportado
https://vision-node-ui-d5lzsmkvgcxattjo4pfnoc.streamlit.app/
