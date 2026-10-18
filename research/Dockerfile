# Research service image. Build from the research/ folder:  docker build -t research-service .
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

# Dependencies come from pyproject.toml, so there is one list to maintain.
COPY pyproject.toml ./
RUN python -c "import tomllib; print('\n'.join(tomllib.load(open('pyproject.toml','rb'))['project']['dependencies']))" > /tmp/requirements.txt \
    && pip install --no-cache-dir -r /tmp/requirements.txt && rm /tmp/requirements.txt

COPY research_service ./research_service
COPY config ./config
COPY sandbox ./sandbox

# Jobs are stored as files under /data/jobs: mount a volume there so they survive a restart.
ENV RESEARCH_STORE_DIR=/data/jobs
RUN useradd --create-home --uid 10001 app && mkdir -p /data/jobs && chown -R app /data
USER app
VOLUME /data
EXPOSE 8001

# Keys are never baked in: pass TAVILY_API_KEY, LLM_API_KEY and NEBIUS_API_KEY at run time (see .env.example).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8001/health', timeout=4).status == 200 else 1)"
CMD ["uvicorn", "research_service.app:app", "--host", "0.0.0.0", "--port", "8001"]
