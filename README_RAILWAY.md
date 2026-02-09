# Despliegue en Railway

Este dashboard está preparado para desplegarse en **Railway** y conectarse automáticamente a Azure Blob Storage.

## 1. Preparar el repositorio
Asegúrate de que la carpeta `vision-node/frontend` tenga su propio repo o configura Railway para desplegar desde esa subcarpeta (Root Directory: `vision-node/frontend`).

## 2. Configurar Variables de Entorno en Railway
Para que la conexión a Azure sea **automática** y no pida contraseña al usuario, debes configurar estas variables en la pestaña **Variables** de tu proyecto en Railway:

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `AZURE_STORAGE_CONNECTION_STRING` | `DefaultEndpointsProtocol=https;AccountName=...` | Tu string de conexión completo (copiar de Azure Portal > Claves de acceso). |
| `PORT` | `8501` | (Opcional) Railway suele asignarlo solo, pero Streamlit usará el que le den. |

## 3. Funcionamiento Automático
- Al iniciar, la app detectará la variable `AZURE_STORAGE_CONNECTION_STRING`.
- En el sidebar, la opción **"Azure Blob (Auto)"** aparecerá seleccionada o disponible.
- El usuario **NO necesita iniciar sesión** ni pegar claves; el servidor ya está autenticado por la variable de entorno.

## 4. Comandos (Referencia)
El `Dockerfile` incluido ya tiene el comando correcto:
```bash
streamlit run app.py --server.port $PORT --server.address 0.0.0.0
```
