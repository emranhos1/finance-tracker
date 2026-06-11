# Daily Finance Management System

## Prerequisites

- Docker & Docker Compose installed
- MySQL running on your **host machine** (not in Docker)

## Setup (2 steps only)

### 1. Configure `.env`

Edit `.env` and set:

```
MYSQL_ROOT_PASSWORD=your_actual_mysql_root_password
MYSQL_PASSWORD=finance_pass_2024          # password for the app DB user
JWT_SECRET_KEY=some_long_random_string_here
ADMIN_PASSWORD=your_secure_admin_password
```

All other defaults work as-is for local setup.

### 2. Start

```bash
docker compose up --build
```

The app will:
1. Wait for MySQL to be reachable on the host
2. Create the `finance_db` database and `finance_user` MySQL user (using root credentials, once)
3. Create all tables
4. Seed the admin user and default categories
5. Start the FastAPI server

Open: [http://localhost:8000](http://localhost:8000)

Login with `ADMIN_USERNAME` / `ADMIN_PASSWORD` from your `.env`.

## MySQL Host Setup

Your host MySQL must allow connections from the Docker subnet (`172.17.0.0/16`).
The setup script creates the app user with `'finance_user'@'%'` so it can connect from the container.

If MySQL is bound to `127.0.0.1` only, update `/etc/mysql/mysql.conf.d/mysqld.cnf`:
```
bind-address = 0.0.0.0
```
Then restart MySQL: `sudo systemctl restart mysql`

## API Docs

Available at: [http://localhost:8000/api/docs](http://localhost:8000/api/docs)

## Stopping

```bash
docker compose down
```
