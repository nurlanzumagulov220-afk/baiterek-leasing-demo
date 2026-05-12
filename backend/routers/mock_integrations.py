import random
import string
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/mock", tags=["Mock Integrations"])


@router.post("/egov/bin")
def mock_egov_bin(body: dict):
    bin_num = body.get("bin", "")
    if not bin_num or len(bin_num) != 12:
        raise HTTPException(400, "БИН должен содержать 12 цифр")
    return {
        "bin": bin_num,
        "company_name": f"ТОО «Компания {bin_num[:4]}»",
        "director_name": "Иванов Иван Иванович",
        "registration_date": "2015-03-15",
        "status": "active",
        "source": "mock_egov",
    }


@router.post("/egov/iin")
def mock_egov_iin(body: dict):
    iin = body.get("iin", "")
    if not iin or len(iin) != 12:
        raise HTTPException(400, "ИИН должен содержать 12 цифр")
    return {
        "iin": iin,
        "full_name": "Сейткали Айбек Маратович",
        "birth_date": "1985-07-20",
        "status": "active",
        "source": "mock_egov",
    }


@router.post("/eis/submit")
def mock_eis_submit(body: dict):
    ref = "EIS-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=8))
    return {
        "eis_ref": ref,
        "status": "received",
        "bpm_system": "mock_baiterek_bpm",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "message": "Заявка принята в обработку",
    }


@router.get("/eis/status/{ref}")
def mock_eis_status(ref: str):
    return {
        "eis_ref": ref,
        "status": random.choice(["received", "processing", "approved", "rejected"]),
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "source": "mock_eis",
    }
