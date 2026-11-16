FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN pip install --no-cache-dir uv==0.13.6 && uv sync --frozen --no-dev
ENV PATH="/app/.venv/bin:$PATH"
COPY buddy ./buddy
COPY data ./data
COPY evaluate.py ./
EXPOSE 8001
CMD ["uvicorn", "buddy.api:create_app", "--factory", "--host", "0.0.0.0", "--port", "8001"]
