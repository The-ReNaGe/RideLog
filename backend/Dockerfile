FROM python:3.11-slim

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
