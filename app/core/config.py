import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    MYSQL_HOST: str = "host.docker.internal"
    MYSQL_PORT: int = 3306
    MYSQL_USER: str = "finance_user"
    MYSQL_PASSWORD: str = ""
    MYSQL_DATABASE: str = "finance_db"

    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480

    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = ""

    SMTP_EMAIL: str = ""
    SMTP_APP_PASSWORD: str = ""
    SMTP_FROM_NAME: str = "Finance Manager"

    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000

    MYSQL_USE_SSL: str = "true"

    class Config:
        env_file = ".env"
        extra = "allow"

    @property
    def database_url(self) -> str:
        use_ssl = self.MYSQL_USE_SSL.lower() not in ("false", "0", "no")
        if use_ssl:
            import certifi
            ca = certifi.where()
            # PyMySQL SSL via query string — works with TiDB Cloud Serverless
            return (
                f"mysql+pymysql://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}"
                f"@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}"
                f"?ssl_ca={ca}&ssl_verify_cert=true&ssl_verify_identity=true"
            )
        return (
            f"mysql+pymysql://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}"
            f"@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}"
        )


settings = Settings()