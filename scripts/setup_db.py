import os, sys, time, traceback

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
    print(f"FATAL: MySQLdb not installed: {e}"); sys.exit(1)

MYSQL_HOST          = os.getenv("MYSQL_HOST", "host.docker.internal")
MYSQL_PORT          = int(os.getenv("MYSQL_PORT", 3306))
MYSQL_USER          = os.getenv("MYSQL_USER", "finance_user")
MYSQL_PASSWORD      = os.getenv("MYSQL_PASSWORD", "")
MYSQL_DATABASE      = os.getenv("MYSQL_DATABASE", "finance_db")
ADMIN_USERNAME      = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD      = os.getenv("ADMIN_PASSWORD", "")

# TiDB Cloud (and most managed MySQL providers) require TLS on public endpoints.
# Primary source: the `certifi` package (already in requirements.txt). It ships
# its own CA bundle inside the Python package itself, so it always exists
# regardless of what's installed at the OS level — more reliable than relying
# on apt-installed system certs, which can vary by base image.
def _find_ca_bundle():
    try:
        import certifi
        path = certifi.where()
        if path and os.path.exists(path):
            return path
    except ImportError:
        pass

    # Fallback: common OS-level locations, in case certifi isn't installed.
    os_candidates = [
        "/etc/ssl/certs/ca-certificates.crt",   # Debian/Ubuntu (incl. python:slim images)
        "/etc/pki/tls/certs/ca-bundle.crt",      # RHEL/CentOS/Alpine variants
        "/etc/ssl/cert.pem",                     # Alpine
    ]
    for path in os_candidates:
        if os.path.exists(path):
            return path
    return None

# Set MYSQL_USE_SSL=false in your LOCAL .env to skip TLS (local MySQL usually
# doesn't have it enabled). Leave it unset (or "true") for TiDB Cloud / Render.
MYSQL_USE_SSL = os.getenv("MYSQL_USE_SSL", "true").lower() not in ("false", "0", "no")
MYSQL_SSL_CA = os.getenv("MYSQL_SSL_CA", _find_ca_bundle()) if MYSQL_USE_SSL else None

print(f"Config: host={MYSQL_HOST} port={MYSQL_PORT} db={MYSQL_DATABASE} user={MYSQL_USER}")
print(f"SSL CA bundle: {MYSQL_SSL_CA or 'NOT FOUND — connection will likely fail if server requires TLS'}")
print(f"Admin: {ADMIN_USERNAME} | Password length: {len(ADMIN_PASSWORD)} bytes")

if len(ADMIN_PASSWORD.encode('utf-8')) > 72:
    print("FATAL: ADMIN_PASSWORD too long (max 72 bytes)"); sys.exit(1)
if not ADMIN_PASSWORD:
    print("FATAL: ADMIN_PASSWORD is empty"); sys.exit(1)


def hash_password(password: str) -> str:
    import bcrypt
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def get_connection(db=None):
    """Single place that knows how to open a TLS connection to TiDB Cloud."""
    kwargs = dict(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        passwd=MYSQL_PASSWORD,
        connect_timeout=10,
    )
    if db:
        kwargs["db"] = db
    if MYSQL_SSL_CA:
        kwargs["ssl_mode"] = "VERIFY_IDENTITY"
        kwargs["ssl"] = {"ca": MYSQL_SSL_CA}
    return MySQLdb.connect(**kwargs)


def wait_for_mysql(max_retries=30):
    print(f"Waiting for MySQL at {MYSQL_HOST}:{MYSQL_PORT} as '{MYSQL_USER}'...")
    for attempt in range(1, max_retries + 1):
        try:
            conn = get_connection()
            conn.close()
            print(f"MySQL is ready (attempt {attempt})")
            return True
        except Exception as e:
            print(f"  Attempt {attempt}/{max_retries}: {e}")
            time.sleep(2)
    print("ERROR: Could not connect to MySQL after max retries."); sys.exit(1)


def ensure_database_exists():
    """
    TiDB Cloud Serverless gives you one user (the root-equivalent you generated
    a password for). That user already has rights to create/use databases, so
    we just make sure our target database exists — no CREATE USER / GRANT
    needed (and those would fail on TiDB Cloud anyway since you don't have a
    true root/superuser on the shared serverless tier).
    """
    conn = get_connection()
    conn.autocommit(True)
    cursor = conn.cursor()
    cursor.execute(
        f"CREATE DATABASE IF NOT EXISTS `{MYSQL_DATABASE}` "
        f"CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
    )
    print(f"Database '{MYSQL_DATABASE}' ensured.")
    cursor.close(); conn.close()


def create_tables():
    conn = get_connection(db=MYSQL_DATABASE)
    conn.autocommit(True)
    cursor = conn.cursor()

    # Users table (app users — not admin)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            email VARCHAR(100) NOT NULL UNIQUE,
            hashed_password VARCHAR(255) NOT NULL,
            role ENUM('admin','user') NOT NULL DEFAULT 'user',
            is_active BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            name VARCHAR(100) NOT NULL,
            type ENUM('cash','bank','dps','fdr','plot') NOT NULL,
            balance DECIMAL(15,2) NOT NULL DEFAULT 0.00,
            starting_date DATE NULL,
            maturity_date DATE NULL,
            account_number VARCHAR(50) NULL,
            installment_amount DECIMAL(15,2) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS categories (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            name VARCHAR(100) NOT NULL,
            type ENUM('income','expense','both') NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            date DATE NOT NULL,
            type ENUM('income','expense','transfer') NOT NULL,
            amount DECIMAL(15,2) NOT NULL,
            category_id INT NULL,
            from_account_id INT NULL,
            to_account_id INT NULL,
            note TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
            FOREIGN KEY (from_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
            FOREIGN KEY (to_account_id) REFERENCES accounts(id) ON DELETE SET NULL
        ) ENGINE=InnoDB
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            token VARCHAR(100) NOT NULL UNIQUE,
            expires_at TIMESTAMP NOT NULL,
            used BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS account_types (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            name VARCHAR(50) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
    """)

    print("All tables ensured.")

    # Auto-migrations
    migrations = [
        ("ALTER TABLE categories MODIFY COLUMN type ENUM('income','expense','both') NOT NULL", "categories.type enum"),
        ("ALTER TABLE accounts ADD COLUMN starting_date DATE NULL AFTER balance", "accounts.starting_date"),
        ("ALTER TABLE accounts ADD COLUMN account_number VARCHAR(50) NULL AFTER maturity_date", "accounts.account_number"),
        ("ALTER TABLE accounts MODIFY COLUMN type ENUM('cash','bank','dps','fdr','plot') NOT NULL", "accounts.type plot"),
        ("ALTER TABLE accounts ADD COLUMN account_type_id INT NULL AFTER type", "accounts.account_type_id"),
        ("ALTER TABLE account_types DROP COLUMN `group`", "account_types drop group"),
        ("ALTER TABLE account_types DROP COLUMN has_account_number", "account_types drop has_account_number"),
        ("ALTER TABLE account_types DROP COLUMN has_maturity_date", "account_types drop has_maturity_date"),
        ("ALTER TABLE account_types DROP COLUMN has_installment", "account_types drop has_installment"),
    ]
    for sql, name in migrations:
        try:
            cursor.execute(sql)
            print(f"Migration applied: {name}")
        except Exception:
            pass

    cursor.close(); conn.close()


DEFAULT_ACCOUNT_TYPES = [
    # (old_enum_value, name)
    ("cash", "CASH"),
    ("bank", "BANK"),
    ("dps",  "DPS"),
    ("fdr",  "FDR"),
    ("plot", "PLOT"),
]


def seed_account_types_and_migrate():
    conn = get_connection(db=MYSQL_DATABASE)
    conn.autocommit(True)
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM users")
    user_ids = [row[0] for row in cursor.fetchall()]

    for uid in user_ids:
        type_ids = {}
        for old_value, name in DEFAULT_ACCOUNT_TYPES:
            cursor.execute("SELECT id FROM account_types WHERE user_id = %s AND name = %s", (uid, name))
            row = cursor.fetchone()
            if row:
                type_ids[old_value] = row[0]
            else:
                cursor.execute(
                    "INSERT INTO account_types (user_id, name) VALUES (%s, %s)",
                    (uid, name)
                )
                type_ids[old_value] = cursor.lastrowid

        # Migrate existing accounts' old enum `type` -> account_type_id
        for old_value, type_id in type_ids.items():
            cursor.execute(
                "UPDATE accounts SET account_type_id = %s WHERE user_id = %s AND type = %s AND account_type_id IS NULL",
                (type_id, uid, old_value)
            )

    print(f"Account types seeded/migrated for {len(user_ids)} user(s).")
    cursor.close(); conn.close()


def seed_admin():
    conn = get_connection(db=MYSQL_DATABASE)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE username = %s AND role = 'admin'", (ADMIN_USERNAME,))
    if cursor.fetchone():
        print(f"Admin user '{ADMIN_USERNAME}' already exists.")
    else:
        hashed = hash_password(ADMIN_PASSWORD)
        cursor.execute(
            "INSERT INTO users (username, email, hashed_password, role, is_active) VALUES (%s, %s, %s, 'admin', TRUE)",
            (ADMIN_USERNAME, f"{ADMIN_USERNAME}@admin.local", hashed)
        )
        conn.commit()
        print(f"Admin user '{ADMIN_USERNAME}' created.")
    cursor.close(); conn.close()


if __name__ == "__main__":
    try:
        wait_for_mysql()
        ensure_database_exists()
        create_tables()
        seed_admin()
        seed_account_types_and_migrate()
        print("=== Setup complete ===")
    except Exception as e:
        print(f"FATAL ERROR: {e}")
        traceback.print_exc()
        sys.exit(1)