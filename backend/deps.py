from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from config import settings
from database import get_db
import models

_security = HTTPBearer(auto_error=False)


def create_token(user_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=settings.TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": user_id, "exp": exp}, settings.JWT_SECRET, algorithm=settings.JWT_ALG)


def _decode_token(token: str) -> Optional[str]:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG]).get("sub")
    except JWTError:
        return None


def get_user_optional(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_security),
    db: Session = Depends(get_db),
) -> Optional[models.User]:
    if not creds:
        return None
    uid = _decode_token(creds.credentials)
    if not uid:
        return None
    return db.query(models.User).filter(models.User.user_id == uid).first()


def get_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_security),
    db: Session = Depends(get_db),
) -> models.User:
    if not creds:
        raise HTTPException(401, "Требуется авторизация")
    uid = _decode_token(creds.credentials)
    if not uid:
        raise HTTPException(401, "Недействительный токен")
    user = db.query(models.User).filter(models.User.user_id == uid).first()
    if not user:
        raise HTTPException(401, "Пользователь не найден")
    return user


def get_admin(user: models.User = Depends(get_user)) -> models.User:
    if not user.is_admin:
        raise HTTPException(403, "Требуются права администратора")
    return user
