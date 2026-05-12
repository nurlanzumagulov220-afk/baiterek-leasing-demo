import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from deps import get_admin, get_user_optional
from engine import calculate, delete_atom, list_atoms, load_atom, save_atom
import models
from verification_layer import stamp_atom

router = APIRouter(tags=["Constructor"])


class CalcRequest(BaseModel):
    equipment_cost: float
    advance_pct: float
    term_months: int


class AtomCreateRequest(BaseModel):
    atom_id: str
    data: dict[str, Any]


class AtomUpdateRequest(BaseModel):
    data: dict[str, Any]


@router.get("/atoms")
def get_atoms():
    return list_atoms()


@router.get("/atoms/{atom_id}")
def get_atom(atom_id: str):
    try:
        return load_atom(atom_id)
    except FileNotFoundError:
        raise HTTPException(404, f"Атом '{atom_id}' не найден")


@router.post("/atoms")
def create_atom(body: AtomCreateRequest, _: models.User = Depends(get_admin)):
    try:
        load_atom(body.atom_id)
        raise HTTPException(400, f"Атом '{body.atom_id}' уже существует")
    except FileNotFoundError:
        pass
    save_atom(body.atom_id, body.data)
    atom = load_atom(body.atom_id)
    stamp = stamp_atom(atom)
    atom["atom_tamga_id"] = stamp["atom_tamga_id"]
    save_atom(body.atom_id, atom)
    return {"status": "created", "atom_id": body.atom_id, "atom_tamga_id": stamp["atom_tamga_id"]}


@router.put("/atoms/{atom_id}")
def update_atom(atom_id: str, body: AtomUpdateRequest, _: models.User = Depends(get_admin)):
    try:
        load_atom(atom_id)
    except FileNotFoundError:
        raise HTTPException(404, f"Атом '{atom_id}' не найден")
    save_atom(atom_id, body.data)
    atom = load_atom(atom_id)
    stamp = stamp_atom(atom)
    atom["atom_tamga_id"] = stamp["atom_tamga_id"]
    save_atom(atom_id, atom)
    return {"status": "updated", "atom_id": atom_id, "atom_tamga_id": stamp["atom_tamga_id"]}


@router.delete("/atoms/{atom_id}")
def remove_atom(atom_id: str, _: models.User = Depends(get_admin)):
    try:
        delete_atom(atom_id)
    except FileNotFoundError:
        raise HTTPException(404, f"Атом '{atom_id}' не найден")
    return {"status": "deleted", "atom_id": atom_id}


@router.post("/calculate/{atom_id}", tags=["Calculator"])
def run_calculate(
    atom_id: str,
    body: CalcRequest,
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_user_optional),
):
    try:
        result = calculate(atom_id, body.equipment_cost, body.advance_pct, body.term_months)
    except FileNotFoundError:
        raise HTTPException(404, f"Продукт '{atom_id}' не найден")
    except ValueError as e:
        raise HTTPException(400, str(e))

    if current_user:
        db.add(models.CalcRecord(
            record_id=str(uuid.uuid4()),
            user_id=current_user.user_id,
            atom_id=atom_id,
            equipment_cost=body.equipment_cost,
            advance_pct=body.advance_pct,
            term_months=body.term_months,
            monthly_payment=result["monthly_payment"],
        ))
        db.commit()

    return result
