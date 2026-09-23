# Demo pública de Centinela en Hugging Face Spaces (SDK docker).
# El contexto de construcción lo arma despliegue/huggingface/publicar.py.
FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

# Spaces corre el contenedor con el usuario 1000.
RUN useradd -m -u 1000 user
WORKDIR /home/user/app

# Dependencias primero: se reusan en caché mientras solo cambien la app o los datos.
COPY --chown=user pyproject.toml ./
COPY --chown=user centinela_core ./centinela_core
RUN pip install --no-cache-dir ".[demo]"

COPY --chown=user . .

USER user
ENV HOME=/home/user \
    CENTINELA_PUBLICO=1

EXPOSE 7860
# enableXsrfProtection=false: Spaces sirve la app dentro de un iframe de huggingface.co,
# y con la protección activa la subida de archivos responde 403.
CMD ["streamlit", "run", "demo/app.py", \
     "--server.port=7860", "--server.address=0.0.0.0", "--server.headless=true", \
     "--server.maxUploadSize=10", "--server.enableXsrfProtection=false", \
     "--browser.gatherUsageStats=false", "--theme.base=dark"]
