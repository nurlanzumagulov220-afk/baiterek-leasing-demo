from sqlalchemy import Boolean, Column, DateTime, Float, Integer, JSON, String, Text, func
from database import Base


class FLBufferEntry(Base):
    """Персистентный буфер для FedAvg-градиентов.
    Заменяет глобальный список _fl_buffer, который обнулялся при рестарте воркера."""
    __tablename__ = "fl_buffer"
    id = Column(Integer, primary_key=True, autoincrement=True)
    trust_score = Column(Float, nullable=False)
    status = Column(String, nullable=False)      # VERIFIED | BLOCKED
    fields_check = Column(Boolean, nullable=False, default=False)
    params_check = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, server_default=func.now())


class User(Base):
    __tablename__ = "users"
    user_id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())


class Application(Base):
    __tablename__ = "applications"
    app_id = Column(String, primary_key=True)
    user_id = Column(String, nullable=True)
    atom_id = Column(String, nullable=False)
    form_data = Column(JSON, nullable=False)
    status = Column(String, default="pending")
    # pending | under_review | approved | rejected | requires_docs
    eis_ref = Column(String, nullable=True)
    admin_comment = Column(Text, nullable=True)
    # Verification layer fields
    tamga_id = Column(String, nullable=True)            # Tamga заявки от Tol
    atom_tamga_id = Column(String, nullable=True)       # Hash атома на момент подачи
    trust_score = Column(Float, nullable=True)          # Trust score от Tol
    verification_status = Column(String, nullable=True) # VERIFIED / BLOCKED
    amanat_id = Column(String, nullable=True)           # Hash графика платежей после approve
    amanat_signature = Column(String, nullable=True)    # Ed25519 подпись Aksakal
    rejection_reasons = Column(JSON, nullable=True)     # Причины отказа от Tol + Aksakal
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class CalcRecord(Base):
    __tablename__ = "calc_records"
    record_id = Column(String, primary_key=True)
    user_id = Column(String, nullable=True)
    atom_id = Column(String, nullable=False)
    equipment_cost = Column(Float, nullable=False)
    advance_pct = Column(Float, nullable=False)
    term_months = Column(Integer, nullable=False)
    monthly_payment = Column(Float, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
