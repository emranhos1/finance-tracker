#!/bin/sh
set -e

echo "=== Finance App Startup ==="
echo "Running database setup..."

python /app/scripts/setup_db.py

echo "Database setup complete. Starting FastAPI server..."
exec uvicorn app.main:app --host "${APP_HOST:-0.0.0.0}" --port "${APP_PORT:-8000}"
