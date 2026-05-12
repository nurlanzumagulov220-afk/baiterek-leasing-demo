"""Запусти один раз: python3 create_admin.py"""
import uuid
import bcrypt
from database import engine, SessionLocal
import models

models.Base.metadata.create_all(bind=engine)

db = SessionLocal()
email = "admin@baiterek.kz"
if not db.query(models.User).filter(models.User.email == email).first():
    pw = bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode()
    db.add(models.User(user_id=str(uuid.uuid4()), email=email, name="Администратор", password_hash=pw, is_admin=True))
    db.commit()
    print(f"Admin created: {email} / admin123")
else:
    print("Admin already exists")
db.close()
