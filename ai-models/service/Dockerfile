FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY service/app ./app
COPY models ./models
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port \"$PORT\""]
