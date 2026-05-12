import logging
import os

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from deps import get_admin
import models

router = APIRouter(prefix="/admin", tags=["Admin"])
logger = logging.getLogger(__name__)

_FEATURE_META = [
    {
        "id": "fields_completeness",
        "label": "Заполненность полей",
        "description": "Доля заполненных обязательных полей (0..1). Чем выше — тем больше доверие.",
        "direction": "positive",
    },
    {
        "id": "params_compliance",
        "label": "Соответствие параметрам",
        "description": "Все параметры в допустимых пределах атома (0 или 1).",
        "direction": "positive",
    },
    {
        "id": "amount_ratio",
        "label": "Размер суммы (инверсия)",
        "description": "Запрошенная сумма / максимальный лимит. Высокое значение снижает Trust Score.",
        "direction": "negative",
    },
    {
        "id": "doc_presence",
        "label": "Наличие документов",
        "description": "Доля прикреплённых файловых полей (0..1).",
        "direction": "positive",
    },
]


class AskRequest(BaseModel):
    question: str


@router.post("/ask-aksakal")
async def ask_aksakal(
    body: AskRequest,
    _: models.User = Depends(get_admin),
    db: Session = Depends(get_db),
):
    records = (
        db.query(models.Application)
        .order_by(models.Application.created_at.desc())
        .limit(200).all()
    )
    apps = [
        {
            "app_id": r.app_id,
            "atom_id": r.atom_id,
            "status": r.status,
            "trust_score": r.trust_score or 0.0,
            "verification_status": r.verification_status or "",
            "rejection_reasons": r.rejection_reasons or [],
            "created_at": str(r.created_at),
        }
        for r in records
    ]
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{settings.AKSAKAL_URL}/ask",
                json={"question": body.question, "apps": apps},
                timeout=5.0,
            )
        if resp.is_success:
            return resp.json()
        logger.warning("Aksakal /ask returned %s", resp.status_code)
    except Exception as exc:
        logger.warning("Aksakal недоступен (ask): %s", exc)

    return {"answer": f"Aksakal недоступен. В системе {len(apps)} заявок.", "confidence": 0.0}


@router.get("/federated-weights")
async def get_federated_weights(_: models.User = Depends(get_admin)):
    weights_raw: dict | None = None
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{settings.AKSAKAL_URL}/federated/weights", timeout=5.0)
        if r.is_success:
            weights_raw = r.json()
        else:
            logger.warning("Aksakal /federated/weights returned %s", r.status_code)
    except Exception as exc:
        logger.warning("Aksakal недоступен (weights): %s", exc)

    if weights_raw:
        raw_w = weights_raw.get("weights", weights_raw.get("W", [0.30, 0.35, -0.10, 0.25]))
        bias = weights_raw.get("bias", weights_raw.get("B", 0.20))
        if isinstance(raw_w, dict):
            raw_w = list(raw_w.values())
        features = [
            {**meta, "weight": round(raw_w[i], 4) if i < len(raw_w) else 0.0}
            for i, meta in enumerate(_FEATURE_META)
        ]
        return {
            "status": "live",
            "source": "aksakal",
            "bias": round(float(bias), 4),
            "features": features,
            "formula": "trust = sigmoid(w·x + b) mapped to [0.40, 0.95]",
            "federated_learning": True,
        }

    return {
        "status": "fallback",
        "source": "default",
        "bias": 0.20,
        "features": [{**m, "weight": w} for m, w in zip(_FEATURE_META, [0.30, 0.35, -0.10, 0.25])],
        "formula": "trust = sigmoid(w·x + b) mapped to [0.40, 0.95]",
        "federated_learning": False,
    }
