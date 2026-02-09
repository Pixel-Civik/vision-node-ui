# Usar imagen base ligera de Python
FROM python:3.11-slim

# Evitar archivos .pyc y buffering
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Directorio de trabajo
WORKDIR /app

# Instalar dependencias del sistema si fueran necesarias (opcional)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copiar requirements e instalar
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código del frontend
COPY . .

# Exponer el puerto por defecto de Streamlit (aunque Railway usa $PORT)
EXPOSE 8501

# Comando de inicio: usa la variable $PORT que Railway inyecta automáticamente
CMD streamlit run app.py --server.port $PORT --server.address 0.0.0.0
