FROM python:3.11-slim

WORKDIR /app

# Use China mirrors for apt and pip
RUN sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/debian.sources

RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 curl \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple \
    "fastapi>=0.115.0" \
    "uvicorn[standard]>=0.30.0" \
    "graphiti-core>=0.5.0" \
    "redis[hiredis]>=5.0.0" \
    "minio>=7.2.0" \
    "pydantic>=2.0.0" \
    "pydantic-settings>=2.0.0" \
    "structlog>=24.0.0" \
    "httpx>=0.27.0" \
    "python-multipart>=0.0.9" \
    "pymupdf>=1.24.0" \
    "rdflib>=7.0.0"

# Overlay patched Graphiti GenericClient (DeepSeek compatibility)
COPY graphiti_patch/ /usr/local/lib/python3.11/site-packages/graphiti_core/llm_client/

COPY src/ src/

EXPOSE 8100

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8100"]
