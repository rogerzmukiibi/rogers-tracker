from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    All runtime configuration for Rogers Tracker.

    Values are read from environment variables first, then from a .env file
    in the project root (if it exists), then from the defaults below.

    Environment variable names are the field names uppercased, e.g.:
        DB_PATH=/data/tracker.db
        APP_HOST=0.0.0.0
        APP_PORT=8000
        DEBUG=true
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── Database ────────────────────────────────────────────────────
    db_path: Path = Path("data/tracker.db")
    """Path to the SQLite database file. The parent directory is created
    automatically on startup if it does not exist."""

    # ── Server ──────────────────────────────────────────────────────
    app_host: str = "0.0.0.0"
    """Host to bind to. Use 0.0.0.0 to accept connections from other
    devices on the local network (needed for phone access)."""

    app_port: int = 8000

    debug: bool = False
    """Enable FastAPI debug mode and auto-reload. Set to true during
    local development; leave false in Docker."""

    # ── Frontend paths ───────────────────────────────────────────────
    frontend_dir: Path = Path("frontend")
    static_dir: Path = Path("frontend/static")

    # ── App metadata ─────────────────────────────────────────────────
    app_title: str = "Rogers Tracker"
    app_version: str = "1.0.0"


# Module-level singleton — import this everywhere
settings = Settings()
