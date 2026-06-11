FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    default-libmysqlclient-dev \
    pkg-config \
    dos2unix \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Fix Windows CRLF line endings and set executable
RUN dos2unix /app/scripts/startup.sh && chmod +x /app/scripts/startup.sh

EXPOSE 8000

CMD ["/bin/sh", "/app/scripts/startup.sh"]
