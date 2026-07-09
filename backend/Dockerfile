# Astra backend — FastAPI on Python 3.12.
# Build context: ./backend
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# build-essential is a safety net for source builds (e.g. pyswisseph on a
# platform without a matching wheel); harmless when wheels are available.
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Local-instance data (telemetry.db / receipts.db) lives here; mount a volume.
RUN mkdir -p /app/data

# Fail-closed default: development boots without a secret. Real production must
# set AAE_ENV=production AND a strong AAE_SECRET (see DEPLOY.md) or boot refuses.
ENV AAE_ENV=development

EXPOSE 8787

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8787/api/health')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8787"]
