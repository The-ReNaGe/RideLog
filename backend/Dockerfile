FROM python:3.11-slim

# Mises à jour de sécurité Debian AVANT tout le reste. L'image de base est un
# tag mobile reconstruit régulièrement, mais entre deux reconstructions ses
# paquets système prennent du retard : le scan Trivy nocturne a trouvé trois
# CVE critiques dans perl-base (paquet essentiel, on ne peut pas le retirer)
# alors que Debian avait déjà publié le correctif. `apt-get upgrade` les
# applique au moment où NOUS construisons. La liste des paquets est effacée
# ensuite pour ne pas alourdir l'image.
# ARG et non ENV : la valeur ne doit vivre que pendant la construction, pas
# dans l'image finale.
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (cacheable layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create data directory for SQLite + invoices
RUN mkdir -p /data/invoices

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Production: single worker (SQLite is single-writer), auto-restart after 10k requests to prevent memory leaks
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--limit-max-requests", "10000", "--access-log"]
