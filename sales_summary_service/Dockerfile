FROM python:3.11-slim

# Don't write .pyc files, and flush stdout/stderr immediately so logs show
# up in `docker logs` in real time instead of buffering.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# pandas/numpy pull in wheels that sometimes need a compiler on slim images.
# Installed and removed in the same layer to keep the image lean.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first so `pip install` is cached unless deps change.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Only the runtime app + the merge engine it imports — diagnose_duplicates.py
# and verify_merge.py are dev-only CLI tools, not needed in the image.
COPY app.py sales_summary_agent.py ./

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
