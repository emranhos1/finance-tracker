import os
import sys
import time
import traceback

# Load .env manually
try:
    with open('/app/.env') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, _, val = line.partition('=')
                os.environ.setdefault(key.strip(), val.strip())
except FileNotFoundError:
    pass

try:
    import MySQLdb
except ImportError as e:
    print(f"FATAL: MySQLdb not installed: {e}")
    sys.exit(1)

MYSQL_HOST     = os.getenv("MYSQL_HOST", "host.docker.internal")
MYSQL_PORT     = int(os.getenv("MYSQL_PORT", 3306))
MYSQL_ROOT_USER = os.getenv("MYSQL_ROOT_USER", "root")
MYSQL_ROOT_PASSWORD = os.getenv("MYSQL_ROOT_PASSWORD", "")
MYSQL_USER     = os.getenv("MYSQL_USER", "finance_user")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
MYSQL_DATABASE = os.getenv("MYSQL_DATABASE", "finance_db")
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")

print(f"Config: host={MYSQL_HOST} port={MYSQL_PORT} root_user={MYSQL_ROOT_USER} db={MYSQL_DATABASE}")
print(f"Admin username: {ADMIN_USERNAME} | Password length: {len(ADMIN_PASSWORD)} bytes")

# Validate password length before attempting hash
if len(ADMIN_PASSWORD.encode('utf-8')) > 72:
    print(f"FATAL: ADMIN_PASSWORD is too long ({len(ADMIN_PASSWORD.encode())} bytes). "
          f"bcrypt max is 72 bytes. Please shorten it in .env")
    sys.exit(1)

if not ADMIN_PASSWORD:
    print("FATAL: ADMIN_PASSWORD is empty in .env")
    sys.exit(1)


def hash_password(password: str) -> str:
    """Hash password using bcrypt directly (bypasses passlib version issues)."""
    import bcrypt
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def wait_for_mysql(host, port, user, password, max_retries=30):
    print(f"Waiting for MySQL at {host}:{port} as '{user}'...")
    for attempt in range(1, max_retries + 1):
        try:
            conn = MySQLdb.connect(
                host=host, port=port, user=user, passwd=password,
                connect_timeout=5
            )
            conn.close()
            print(f"MySQL is ready (attempt {attempt})")
            return True
        except Exception as e:
            print(f"  Attempt {attempt}/{max_retries}: {e}")
            time.sleep(2)
    print("ERROR: Could not connect to MySQL after max retries.")
    sys.exit(1)


def setup_database():
    wait_for_mysql(MYSQL_HOST, MYSQL_PORT, MYSQL_ROOT_USER, MYSQL_ROOT_PASSWORD)

    conn = MySQLdb.connect(
        host=MYSQL_HOST, port=MYSQL_PORT,
        user=MYSQL_ROOT_USER, passwd=MYSQL_ROOT_PASSWORD,
    )
    conn.autocommit(True)
    cursor = conn.cursor()

    cursor.execute(
        f"CREATE DATABASE IF NOT EXISTS `{MYSQL_DATABASE}` "
        f"CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
    )
    print(f"Database '{MYSQL_DATABASE}' ensured.")

    try:
        cursor.execute(
            f"CREATE USER IF NOT EXISTS '{MYSQL_USER}'@'%' IDENTIFIED BY '{MYSQL_PASSWORD}'"
        )
        cursor.execute(
            f"GRANT ALL PRIVILEGES ON `{MYSQL_DATABASE}`.* TO '{MYSQL_USER}'@'%'"
        )
        cursor.execute("FLUSH PRIVILEGES")
        print(f"User '{MYSQL_USER}'@'%' ensured.")
    except Exception as e:
        print(f"User setup warning (may already exist): {e}")

    cursor.close()
    conn.close()


def create_tables():
    conn = MySQLdb.connect(
        host=MYSQL_HOST, port=MYSQL_PORT,
        user=MYSQL_ROOT_USER, passwd=MYSQL_ROOT_PASSWORD,
        db=MYSQL_DATABASE,
    )
    conn.autocommit(True)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            type ENUM('cash','bank','dps','fdr') NOT NULL,
            balance DECIMAL(15,2) NOT NULL DEFAULT 0.00,
            maturity_date DATE NULL,
            installment_amount DECIMAL(15,2) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS categories (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            type ENUM('income','expense','both') NOT NULL,
            UNIQUE KEY uq_cat_name_type (name, type)
        ) ENGINE=InnoDB
    """)

    # Auto-migrate: add 'both' to existing categories ENUM if missing
    try:
        cursor.execute("""
            ALTER TABLE categories
            MODIFY COLUMN type ENUM('income','expense','both') NOT NULL
        """)
    except Exception:
        pass  # already correct

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            date DATE NOT NULL,
            type ENUM('income','expense','transfer') NOT NULL,
            amount DECIMAL(15,2) NOT NULL,
            category_id INT NULL,
            from_account_id INT NULL,
            to_account_id INT NULL,
            note TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
            FOREIGN KEY (from_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
            FOREIGN KEY (to_account_id) REFERENCES accounts(id) ON DELETE SET NULL
        ) ENGINE=InnoDB
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS admin_users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            hashed_password VARCHAR(255) NOT NULL
        ) ENGINE=InnoDB
    """)

    print("All tables ensured.")
    cursor.close()
    conn.close()


def seed_admin():
    conn = MySQLdb.connect(
        host=MYSQL_HOST, port=MYSQL_PORT,
        user=MYSQL_ROOT_USER, passwd=MYSQL_ROOT_PASSWORD,
        db=MYSQL_DATABASE,
    )
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM admin_users WHERE username = %s", (ADMIN_USERNAME,))
    if cursor.fetchone():
        print(f"Admin user '{ADMIN_USERNAME}' already exists.")
    else:
        hashed = hash_password(ADMIN_PASSWORD)
        cursor.execute(
            "INSERT INTO admin_users (username, hashed_password) VALUES (%s, %s)",
            (ADMIN_USERNAME, hashed),
        )
        conn.commit()
        print(f"Admin user '{ADMIN_USERNAME}' created.")

    conn.commit()
    cursor.close()
    conn.close()


if __name__ == "__main__":
    try:
        setup_database()
        create_tables()
        seed_admin()
        print("=== Setup complete ===")
    except Exception as e:
        print(f"FATAL ERROR during setup: {e}")
        traceback.print_exc()
        sys.exit(1)
