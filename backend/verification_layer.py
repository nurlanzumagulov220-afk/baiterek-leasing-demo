# Author: TSP Team, 2026
# Created for Baiterek Hackathon
"""
Verification Layer — Python → Aksakal (Go, порт 8080).
Fallback: локальная проверка если Aksakal недоступен.
FL-буфер хранится в БД (таблица fl_buffer) — не теряется при рестарте.
"""

import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_AKSAKAL_URL = os.environ.get("AKSAKAL_URL", "http://localhost:8080")
_FL_BATCH_SIZE = 10


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sha256(data: dict) -> str:
    raw = json.dumps(data, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode()).hexdigest()


def _hash_documents(form_data: dict) -> str:
    """SHA-256 хеш всех файловых полей заявки для доказательства целостности."""
    doc_fields = {
        k: v for k, v in form_data.items()
        if isinstance(v, str) and v and ("." in v[-6:] or len(v) > 30)
    }
    return _sha256(doc_fields) if doc_fields else "no_documents"


# ── FL буфер в БД ─────────────────────────────────────────────────────────────

def _fl_add(trust_score: float, status: str, sources: dict) -> int:
    """Добавляет запись в FL-буфер. Возвращает текущий размер буфера."""
    from database import SessionLocal
    import models as m
    db = SessionLocal()
    try:
        db.add(m.FLBufferEntry(
            trust_score=trust_score,
            status=status,
            fields_check=bool(sources.get("fields_check")),
            params_check=bool(sources.get("params_check")),
        ))
        db.commit()
        return db.query(m.FLBufferEntry).count()
    except Exception as exc:
        logger.error("FL буфер — ошибка записи в БД: %s", exc)
        db.rollback()
        return 0
    finally:
        db.close()


def _fl_drain() -> list[dict]:
    """Читает все записи буфера, очищает таблицу и возвращает список."""
    from database import SessionLocal
    import models as m
    db = SessionLocal()
    try:
        entries = db.query(m.FLBufferEntry).all()
        result = [
            {
                "trust_score": e.trust_score,
                "status": e.status,
                "sources": {"fields_check": e.fields_check, "params_check": e.params_check},
            }
            for e in entries
        ]
        db.query(m.FLBufferEntry).delete()
        db.commit()
        return result
    except Exception as exc:
        logger.error("FL буфер — ошибка чтения/очистки: %s", exc)
        db.rollback()
        return []
    finally:
        db.close()


# ── 1. Tamga на атом ──────────────────────────────────────────────────────────

def stamp_atom(atom_data: dict) -> dict:
    """Подписывает JSON атома через Aksakal Ed25519. Fallback — SHA-256."""
    clean = {
        k: v for k, v in atom_data.items()
        if k not in ("atom_tamga_id", "stamped_at", "aksakal_signature", "aksakal_pub_key")
    }
    tamga_id = _sha256(clean)
    try:
        resp = httpx.post(f"{_AKSAKAL_URL}/internal/sign", json=clean, timeout=3.0)
        if resp.is_success:
            data = resp.json()
            return {
                "atom_tamga_id": tamga_id,
                "stamped_at": _now(),
                "aksakal_signature": data.get("signature"),
                "aksakal_pub_key": data.get("pub_key"),
            }
        logger.warning("Aksakal /internal/sign вернул %s", resp.status_code)
    except Exception as exc:
        logger.warning("Aksakal недоступен при stamp_atom: %s", exc)

    return {"atom_tamga_id": tamga_id, "stamped_at": _now(), "aksakal_signature": None}


def verify_atom_integrity(atom: dict) -> bool:
    stored = atom.get("atom_tamga_id")
    if not stored:
        return True
    clean = {
        k: v for k, v in atom.items()
        if k not in ("atom_tamga_id", "stamped_at", "aksakal_signature", "aksakal_pub_key")
    }
    return _sha256(clean) == stored


# ── 2. Tol-верификация заявки ─────────────────────────────────────────────────

def _all_fields(atom: dict) -> list:
    if "steps" in atom:
        result = []
        for step in atom["steps"]:
            result.extend(step.get("fields", []))
        return result
    return atom.get("fields", [])


def _compute_features(atom: dict, form_data: dict) -> dict:
    params = atom.get("params", {})
    fields = _all_fields(atom)

    required_non_file = [
        f for f in fields
        if (f.get("validation", {}).get("required") or f.get("required"))
        and f.get("type") not in ("calculated", "file")
    ]
    all_file_fields = [f for f in fields if f.get("type") == "file"]

    filled_non_file = sum(
        1 for f in required_non_file
        if form_data.get(f["id"]) not in (None, "", 0, False)
    )
    fields_completeness = filled_non_file / len(required_non_file) if required_non_file else 1.0

    filled_files = sum(1 for f in all_file_fields if form_data.get(f["id"]) not in (None, ""))
    doc_presence = filled_files / len(all_file_fields) if all_file_fields else 1.0

    def _num(v):
        try:
            return float(v)
        except Exception:
            return None

    params_ok = True
    amount_ratio = 0.5

    cost = _num(form_data.get("equipment_cost"))
    if cost is not None:
        max_amount = params.get("max_amount", 1) or 1
        amount_ratio = min(cost / max_amount, 1.0)
        if params.get("min_amount") and cost < params["min_amount"]:
            params_ok = False
        if params.get("max_amount") and cost > params["max_amount"]:
            params_ok = False

    adv = _num(form_data.get("advance_pct"))
    if adv is not None:
        if params.get("advance_pct_min") and adv < params["advance_pct_min"]:
            params_ok = False
        if params.get("advance_pct_max") and adv > params["advance_pct_max"]:
            params_ok = False

    term = _num(form_data.get("term_months"))
    if term is not None:
        if params.get("min_months") and term < params["min_months"]:
            params_ok = False
        if params.get("max_months") and term > params["max_months"]:
            params_ok = False

    return {
        "fields_completeness": round(fields_completeness, 4),
        "params_compliance": 1.0 if params_ok else 0.0,
        "amount_ratio": round(amount_ratio, 4),
        "doc_presence": round(doc_presence, 4),
    }


def verify_tol(atom: dict, form_data: dict) -> dict[str, Any]:
    features = _compute_features(atom, form_data)
    doc_hash = _hash_documents(form_data)
    tamga_id = _sha256({
        "atom_id": atom.get("atom_id"),
        "form": form_data,
        "doc_hash": doc_hash,
        "ts": _now(),
    })

    try:
        resp = httpx.post(f"{_AKSAKAL_URL}/internal/score", json=features, timeout=5.0)
        if resp.is_success:
            result = resp.json()
            trust_score = result.get("trust_score", 0.5)
            status = result.get("status", "BLOCKED")
            reasons = result.get("reasons", [])

            buf_size = _fl_add(
                trust_score=trust_score,
                status=status,
                sources={
                    "fields_check": features["fields_completeness"] >= 0.9,
                    "params_check": features["params_compliance"] == 1.0,
                },
            )
            if buf_size >= _FL_BATCH_SIZE:
                push_gradient("baiterek_node")

            return {
                "tamga_id": tamga_id,
                "doc_hash": doc_hash,
                "trust_score": trust_score,
                "status": status,
                "aksakal_used": True,
                "tol_sources": {**features, "aksakal_used": True, "doc_hash": doc_hash},
                "reasons": reasons,
            }
        logger.warning("Aksakal /internal/score вернул %s", resp.status_code)
    except Exception as exc:
        logger.warning("Aksakal недоступен (verify_tol), использую fallback: %s", exc)

    # Fallback — локальная проверка
    params_ok = features["params_compliance"] == 1.0
    fields_ok = features["fields_completeness"] >= 0.9
    trust_score = 0.87 if (params_ok and fields_ok) else 0.45
    status = "VERIFIED" if trust_score >= 0.80 else "BLOCKED"
    reasons = []
    if not fields_ok:
        reasons.append(f"Заполнено только {int(features['fields_completeness'] * 100)}% обязательных полей")
    if not params_ok:
        reasons.append("Параметры заявки не соответствуют условиям продукта")
    if not reasons:
        reasons.append("Все проверки пройдены успешно")

    return {
        "tamga_id": tamga_id,
        "doc_hash": doc_hash,
        "trust_score": trust_score,
        "status": status,
        "aksakal_used": False,
        "tol_sources": {**features, "aksakal_used": False, "doc_hash": doc_hash},
        "reasons": reasons,
    }


# ── 3. Amanat — фиксация графика платежей ────────────────────────────────────

def settle_amanat(app_id: str, tamga_id: str, payment_schedule: list, atom_tamga_id: str) -> dict[str, Any]:
    payload = {
        "app_id": app_id,
        "tamga_id": tamga_id,
        "atom_tamga_id": atom_tamga_id,
        "schedule_hash": _sha256({"payments": payment_schedule}),
        "settled_at": _now(),
    }
    amanat_id = _sha256(payload)

    try:
        resp = httpx.post(f"{_AKSAKAL_URL}/internal/sign", json=payload, timeout=5.0)
        if resp.is_success:
            data = resp.json()
            return {
                "amanat_id": amanat_id,
                "status": "SETTLED",
                "settled_at": _now(),
                "amanat_signature": data.get("signature"),
            }
        logger.warning("Aksakal /internal/sign (amanat) вернул %s", resp.status_code)
    except Exception as exc:
        logger.warning("Aksakal недоступен (settle_amanat): %s", exc)

    return {"amanat_id": amanat_id, "status": "SETTLED", "settled_at": _now(), "amanat_signature": None}


# ── Federated Learning ────────────────────────────────────────────────────────

def push_gradient(node_id: str) -> bool:
    buffer = _fl_drain()
    if not buffer:
        return False

    n = len(buffer)
    grad = [0.0, 0.0, 0.0, 0.0]
    bias_delta = 0.0

    for item in buffer:
        score = item["trust_score"]
        target = 1.0 if item["status"] == "VERIFIED" else 0.0
        err = target - score
        s = item.get("sources", {})
        grad[0] += err * (1.0 if s.get("fields_check") else 0.5)
        grad[1] += err * (1.0 if s.get("params_check") else 0.0)
        grad[2] += err * 0.1
        grad[3] += err * 0.25
        bias_delta += err

    grad = [g / n for g in grad]
    bias_delta /= n

    try:
        resp = httpx.post(
            f"{_AKSAKAL_URL}/federated/update",
            json={"node_id": node_id, "gradients": grad, "bias_delta": bias_delta, "n_samples": n},
            timeout=3.0,
        )
        if resp.is_success:
            logger.info("FL градиент отправлен: node=%s n=%d", node_id, n)
            return True
        logger.warning("Aksakal /federated/update вернул %s", resp.status_code)
    except Exception as exc:
        logger.warning("Aksakal недоступен (push_gradient): %s", exc)

    return False
