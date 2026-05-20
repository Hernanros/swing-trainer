# Single stage: Python backend serving pre-built frontend
FROM python:3.13-slim
# Use /srv so Railway's /app volume only holds the database, not the code
WORKDIR /srv
RUN mkdir -p /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
COPY frontend/dist ./frontend/dist

ENV PORT=8000
# Database lives at /app/swing-trainer.db (persisted by Railway volume mount at /app)
ENV DATABASE_URL=sqlite:////app/swing-trainer.db
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips='*'"]
