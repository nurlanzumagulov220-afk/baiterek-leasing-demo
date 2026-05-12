import uuid

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from deps import create_token
import models

router = APIRouter(prefix="/auth", tags=["Auth"])


class RegisterRequest(BaseModel):
    email: str
    name: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


def _user_response(user: models.User) -> dict:
    return {
        "user_id": user.user_id,
        "name": user.name,
        "email": user.email,
        "is_admin": user.is_admin,
        "token": create_token(user.user_id),
    }


@router.post("/register")
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.email == body.email).first():
        raise HTTPException(400, "Email уже зарегистрирован")
    pw = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    user = models.User(
        user_id=str(uuid.uuid4()),
        email=body.email,
        name=body.name,
        password_hash=pw,
    )
    db.add(user)
    db.commit()
    return _user_response(user)


@router.post("/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == body.email).first()
    if not user or not bcrypt.checkpw(body.password.encode(), user.password_hash.encode()):
        raise HTTPException(401, "Неверный email или пароль")
    return _user_response(user)
