# Author: TSP Team, 2026
# Created for Baiterek Hackathon
import logging
import os
import uuid

import bcrypt
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from config import settings
from database import engine, SessionLocal
import models
from routers import admin, applications, atoms, auth, mock_integrations

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

# ── DB init ───────────────────────────────────────────────────────────────────
models.Base.metadata.create_all(bind=engine)
_migrate_cols = [
    "ALTER TABLE applications ADD COLUMN tamga_id TEXT",
    "ALTER TABLE applications ADD COLUMN atom_tamga_id TEXT",
    "ALTER TABLE applications ADD COLUMN trust_score REAL",
    "ALTER TABLE applications ADD COLUMN verification_status TEXT",
    "ALTER TABLE applications ADD COLUMN amanat_id TEXT",
    "ALTER TABLE applications ADD COLUMN amanat_signature TEXT",
    "ALTER TABLE applications ADD COLUMN rejection_reasons TEXT",
]
with engine.connect() as _conn:
    for _stmt in _migrate_cols:
        try:
            _conn.execute(text(_stmt))
            _conn.commit()
        except Exception:
            pass  # column already exists


def _ensure_admin() -> None:
    db = SessionLocal()
    try:
        email = settings.ADMIN_EMAIL
        if not db.query(models.User).filter(models.User.email == email).first():
            pw = bcrypt.hashpw(settings.ADMIN_PASSWORD.encode(), bcrypt.gensalt()).decode()
            db.add(models.User(
                user_id=str(uuid.uuid4()),
                email=email,
                name="Администратор",
                password_hash=pw,
                is_admin=True,
            ))
            db.commit()
            logger.info("Admin создан: %s", email)
        else:
            logger.info("Admin уже существует: %s", email)
    finally:
        db.close()


_ensure_admin()

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Baiterek Leasing Engine",
    description="No-code платформа-конструктор форм. Genesis Atom архитектура.",
    version="1.0.0",
)

# CORS: в production задайте CORS_ORIGINS="https://baiterek.kz,https://app.baiterek.kz"
_origins = settings.CORS_ORIGINS
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(atoms.router)
app.include_router(applications.router)
app.include_router(admin.router)
app.include_router(mock_integrations.router)


@app.get("/health", tags=["System"])
def health():
    return {"status": "ok", "service": "Baiterek Leasing Engine", "version": "1.0.0"}
