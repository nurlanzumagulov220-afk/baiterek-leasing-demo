import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    JWT_SECRET: str = os.environ.get("JWT_SECRET", "baiterek-dev-secret")
    JWT_ALG: str = "HS256"
    TOKEN_EXPIRE_DAYS: int = 30

    ADMIN_EMAIL: str = os.environ.get("ADMIN_EMAIL", "admin@baiterek.kz")
    ADMIN_PASSWORD: str = os.environ.get("ADMIN_PASSWORD", "admin123")

    AKSAKAL_URL: str = os.environ.get("AKSAKAL_URL", "http://localhost:8080")

    # Публичный базовый URL для QR-кода в договоре.
    # В production: https://api.qumyrsqa.kz
    VERIFY_BASE_URL: str = os.environ.get("VERIFY_BASE_URL", "http://localhost:8000")

    # Comma-separated origins, e.g. "https://baiterek.kz,https://www.baiterek.kz"
    # Set to "*" only for local dev; in production list explicit domains.
    CORS_ORIGINS: list[str] = os.environ.get("CORS_ORIGINS", "*").split(",")


settings = Settings()
