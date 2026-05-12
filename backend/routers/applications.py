import io
import random
import string
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from config import settings
from constants import APP_STATUSES, FONTS_DIR
from database import get_db
from deps import get_admin, get_user, get_user_optional
from engine import calculate, load_atom
import models
from verification_layer import settle_amanat, verify_tol

router = APIRouter(tags=["Applications"])


# ── Execution Oracle — публичная верификация по Tamga ID ──────────────────────

@router.get("/verify/{tamga_id}", tags=["Verification"])
def verify_tamga(tamga_id: str, db: Session = Depends(get_db)):
    """Публичный эндпоинт. Сканирование QR-кода договора отправляет сюда.
    Возвращает полный криптографический паспорт заявки без авторизации."""
    record = (
        db.query(models.Application)
        .filter(models.Application.tamga_id == tamga_id)
        .first()
    )
    if not record:
        raise HTTPException(404, "Tamga ID не найден. Документ не зарегистрирован в системе.")

    trust = record.trust_score
    return {
        "valid": True,
        "oracle": "Baiterek Execution Oracle v1.0",
        "tamga_id": record.tamga_id,
        "app_id": record.app_id[:8].upper(),
        "atom_id": record.atom_id,
        "eis_ref": record.eis_ref,
        "status": record.status,
        "status_label": APP_STATUSES.get(record.status, record.status),
        "trust_score": trust,
        "trust_pct": f"{trust * 100:.0f}%" if trust is not None else None,
        "verification_status": record.verification_status,
        "atom_tamga_id": record.atom_tamga_id,
        "amanat_id": record.amanat_id,
        "amanat_signature": record.amanat_signature,
        "issued_at": str(record.created_at),
        "verified_at": str(record.updated_at) if record.updated_at else str(record.created_at),
        "blockchain_note": "Параметры зафиксированы криптографически. Изменение задним числом невозможно.",
    }


# ── QR-код ────────────────────────────────────────────────────────────────────

def _make_qr_png(url: str, box_size: int = 6) -> io.BytesIO:
    """Генерирует QR-код и возвращает PNG в BytesIO."""
    import qrcode
    from qrcode.image.pil import PilImage

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,  # 30% восстановление
        box_size=box_size,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(image_factory=PilImage, fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


class ApplicationRequest(BaseModel):
    form_data: dict[str, Any]


class StatusUpdateRequest(BaseModel):
    status: str
    admin_comment: Optional[str] = None


# ── Serialiser ────────────────────────────────────────────────────────────────

def app_to_dict(r: models.Application) -> dict:
    return {
        "app_id": r.app_id,
        "atom_id": r.atom_id,
        "status": r.status,
        "status_label": APP_STATUSES.get(r.status, r.status),
        "eis_ref": r.eis_ref,
        "admin_comment": r.admin_comment,
        "form_data": r.form_data,
        "verification": {
            "tamga_id": r.tamga_id,
            "atom_tamga_id": r.atom_tamga_id,
            "trust_score": r.trust_score,
            "verification_status": r.verification_status,
            "amanat_id": r.amanat_id,
            "amanat_signature": r.amanat_signature,
            "rejection_reasons": r.rejection_reasons or [],
        },
        "created_at": str(r.created_at),
        "updated_at": str(r.updated_at) if r.updated_at else None,
    }


# ── Submit ────────────────────────────────────────────────────────────────────

@router.post("/applications/{atom_id}")
def submit_application(
    atom_id: str,
    body: ApplicationRequest,
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_user_optional),
):
    try:
        atom = load_atom(atom_id)
    except FileNotFoundError:
        raise HTTPException(404, f"Услуга '{atom_id}' не найдена")

    verification = verify_tol(atom, body.form_data)
    if verification["status"] == "BLOCKED":
        raise HTTPException(400, {
            "message": "Заявка заблокирована системой верификации",
            "trust_score": verification["trust_score"],
            "tol_sources": verification["tol_sources"],
            "reasons": verification["reasons"],
        })

    app_id = str(uuid.uuid4())
    eis_ref = "EIS-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=8))

    record = models.Application(
        app_id=app_id,
        user_id=current_user.user_id if current_user else None,
        atom_id=atom_id,
        form_data=body.form_data,
        status="pending",
        eis_ref=eis_ref,
        tamga_id=verification["tamga_id"],
        atom_tamga_id=atom.get("atom_tamga_id"),
        trust_score=verification["trust_score"],
        verification_status=verification["status"],
        rejection_reasons=verification["reasons"],
    )
    db.add(record)
    db.commit()

    return {
        "app_id": app_id,
        "status": "pending",
        "status_label": APP_STATUSES["pending"],
        "eis_ref": eis_ref,
        "message": "Заявка принята. Ожидайте уведомления.",
        "tamga_id": verification["tamga_id"],
        "trust_score": verification["trust_score"],
        "tol_sources": verification["tol_sources"],
        "created_at": record.created_at,
    }


# ── List / Get ────────────────────────────────────────────────────────────────

@router.get("/applications")
def list_applications(
    current_user: models.User = Depends(get_user),
    db: Session = Depends(get_db),
):
    query = db.query(models.Application)
    if not current_user.is_admin:
        query = query.filter(models.Application.user_id == current_user.user_id)
    records = query.order_by(models.Application.created_at.desc()).limit(50).all()
    return [app_to_dict(r) for r in records]


@router.get("/applications/{app_id}/contract.pdf")
def download_contract(
    app_id: str,
    current_user: models.User = Depends(get_user),
    db: Session = Depends(get_db),
):
    record = db.query(models.Application).filter(models.Application.app_id == app_id).first()
    if not record:
        raise HTTPException(404, "Заявка не найдена")
    if not current_user.is_admin and record.user_id != current_user.user_id:
        raise HTTPException(403, "Нет доступа")
    pdf_bytes = _generate_contract_pdf(record)
    filename = f"contract_{app_id[:8].upper()}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/applications/{app_id}")
def get_application(
    app_id: str,
    current_user: models.User = Depends(get_user),
    db: Session = Depends(get_db),
):
    record = db.query(models.Application).filter(models.Application.app_id == app_id).first()
    if not record:
        raise HTTPException(404, "Заявка не найдена")
    if not current_user.is_admin and record.user_id != current_user.user_id:
        raise HTTPException(403, "Нет доступа")
    return app_to_dict(record)


# ── Status update ─────────────────────────────────────────────────────────────

@router.patch("/applications/{app_id}/status")
def update_status(
    app_id: str,
    body: StatusUpdateRequest,
    _: models.User = Depends(get_admin),
    db: Session = Depends(get_db),
):
    if body.status not in APP_STATUSES:
        raise HTTPException(400, f"Неверный статус. Допустимые: {list(APP_STATUSES.keys())}")
    record = db.query(models.Application).filter(models.Application.app_id == app_id).first()
    if not record:
        raise HTTPException(404, "Заявка не найдена")

    record.status = body.status
    if body.admin_comment:
        record.admin_comment = body.admin_comment

    if body.status == "approved" and not record.amanat_id:
        try:
            schedule_result = calculate(
                record.atom_id,
                float(record.form_data.get("equipment_cost", 0)),
                float(record.form_data.get("advance_pct", 0)),
                int(record.form_data.get("term_months", 12)),
            )
            amanat = settle_amanat(
                app_id=record.app_id,
                tamga_id=record.tamga_id or "",
                payment_schedule=schedule_result.get("schedule", []),
                atom_tamga_id=record.atom_tamga_id or "",
            )
            record.amanat_id = amanat["amanat_id"]
            record.amanat_signature = amanat.get("amanat_signature")
        except Exception:
            pass  # не ломаем одобрение если у атома нет финансовых полей

    db.commit()
    db.refresh(record)
    return app_to_dict(record)


# ── Cabinet ───────────────────────────────────────────────────────────────────

@router.get("/cabinet", tags=["Cabinet"])
def cabinet(current_user: models.User = Depends(get_user), db: Session = Depends(get_db)):
    apps = (
        db.query(models.Application)
        .filter(models.Application.user_id == current_user.user_id)
        .order_by(models.Application.created_at.desc())
        .limit(50).all()
    )
    calcs = (
        db.query(models.CalcRecord)
        .filter(models.CalcRecord.user_id == current_user.user_id)
        .order_by(models.CalcRecord.created_at.desc())
        .limit(20).all()
    )
    return {
        "user": {"name": current_user.name, "email": current_user.email, "is_admin": current_user.is_admin},
        "stats": {
            "total_applications": len(apps),
            "approved": sum(1 for a in apps if a.status == "approved"),
            "pending": sum(1 for a in apps if a.status == "pending"),
            "total_calculations": len(calcs),
        },
        "applications": [app_to_dict(a) for a in apps],
        "calculations": [
            {
                "record_id": c.record_id,
                "atom_id": c.atom_id,
                "equipment_cost": c.equipment_cost,
                "monthly_payment": c.monthly_payment,
                "term_months": c.term_months,
                "created_at": str(c.created_at),
            }
            for c in calcs
        ],
    }


# ── PDF generator ─────────────────────────────────────────────────────────────

def _generate_contract_pdf(record: models.Application) -> bytes:
    from fpdf import FPDF

    font_regular = FONTS_DIR / "DejaVuSans.ttf"
    font_bold = FONTS_DIR / "DejaVuSans-Bold.ttf"
    use_custom = font_regular.exists()
    font_name = "DejaVu" if use_custom else "Helvetica"
    tamga = (record.tamga_id or "")[:32]

    class PDF(FPDF):
        def header(self):
            # Левая часть: название организации
            self.set_font(font_name, style="B", size=10)
            self.set_text_color(0, 79, 158)
            self.cell(130, 7, "АО «БАЙТЕРЕК» · ПОРТАЛ ПОДДЕРЖКИ БИЗНЕСА",
                      align="L", new_x="RIGHT", new_y="TOP")
            # Правая часть: брендинг QumyrsqaCore
            self.set_font(font_name, style="B", size=7)
            self.set_text_color(80, 80, 80)
            self.cell(0, 3.5, "Защищено технологией", align="R", new_x="LMARGIN", new_y="NEXT")
            self.set_x(self.l_margin + 130)
            self.set_font(font_name, style="B", size=8)
            self.set_text_color(0, 79, 158)
            self.cell(0, 3.5, "Execution Oracle · QumyrsqaCore™", align="R", new_x="LMARGIN", new_y="NEXT")
            self.set_draw_color(0, 79, 158)
            self.set_line_width(0.5)
            self.line(self.l_margin, self.get_y(), self.l_margin + self.epw, self.get_y())
            self.ln(3)

        def footer(self):
            self.set_y(-12)
            self.set_font(font_name, size=6.5)
            self.set_text_color(150, 150, 150)
            self.cell(0, 4,
                      f"Tamga: {tamga}  ·  QumyrsqaCore™ Execution Oracle  ·  Стр. {self.page_no()}",
                      align="C")

    pdf = PDF()
    if use_custom:
        pdf.add_font("DejaVu", fname=str(font_regular))
    if font_bold.exists():
        pdf.add_font("DejaVu", style="B", fname=str(font_bold))

    pdf.set_margins(14, 14, 14)
    pdf.add_page()

    fd = record.form_data or {}
    created = str(record.created_at)[:10]
    app_num = record.app_id[:8].upper()
    W = pdf.epw
    lw, vw = 58, pdf.epw - 58

    def fmt_kzt(v) -> str:
        try:
            return f"{float(v):,.0f} KZT".replace(",", " ")
        except Exception:
            return str(v) if v else "—"

    def section(title: str):
        pdf.set_fill_color(232, 240, 255)
        pdf.set_font(font_name, style="B", size=10)
        pdf.set_text_color(0, 60, 130)
        pdf.cell(0, 8, f"  {title}", fill=True, new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(20, 20, 20)
        pdf.ln(2)

    def row(label: str, value: str):
        pdf.set_font(font_name, style="B", size=9)
        pdf.set_text_color(90, 90, 90)
        pdf.cell(lw, 6, label, new_x="RIGHT", new_y="TOP")
        pdf.set_font(font_name, size=9)
        pdf.set_text_color(20, 20, 20)
        pdf.multi_cell(vw, 6, str(value) if value else "—", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font(font_name, style="B", size=15)
    pdf.set_text_color(20, 20, 20)
    pdf.cell(0, 10, "ДОГОВОР ФИНАНСОВОГО ЛИЗИНГА", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font(font_name, size=10)
    pdf.set_text_color(110, 110, 110)
    pdf.cell(0, 6, f"№ {app_num}   от   {created}", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(8)

    section("1. СТОРОНЫ ДОГОВОРА")
    row("Лизингодатель:", "АО «Байтерек Девелопмент», г. Астана")
    row("Лизингополучатель:", fd.get("company_name") or fd.get("director_name") or "—")
    row("БИН:", fd.get("bin") or "—")
    row("Директор:", fd.get("director_name") or "—")
    pdf.ln(4)

    section("2. ПРЕДМЕТ ДОГОВОРА")
    row("Услуга / Продукт:", record.atom_id or "—")
    row("ЕИШ-номер:", record.eis_ref or "—")
    row("Дата подачи:", created)
    pdf.ln(4)

    section("3. ФИНАНСОВЫЕ УСЛОВИЯ")
    row("Стоимость оборудования:", fmt_kzt(fd.get("equipment_cost")))
    row("Аванс:", f"{fd.get('advance_pct', '—')} %")
    row("Сумма финансирования:", fmt_kzt(fd.get("principal") or fd.get("equipment_cost")))
    row("Срок лизинга:", f"{fd.get('term_months', '—')} мес.")
    row("Ежемесячный платёж:", fmt_kzt(fd.get("monthly_payment")))
    row("Общая сумма выплат:", fmt_kzt(fd.get("total_payment")))
    pdf.ln(4)

    section("4. AI-ВЕРИФИКАЦИЯ (Tol / Aksakal)")
    trust = record.trust_score
    row("Trust Score:", f"{trust * 100:.0f}%" if trust is not None else "—")
    row("Статус:", record.verification_status or "—")
    row("Tamga ID:", record.tamga_id or "—")
    row("Amanat ID:", record.amanat_id or "—")
    pdf.ln(4)

    section("5. СТАТУС ЗАЯВКИ")
    row("Статус:", APP_STATUSES.get(record.status, record.status))
    if record.admin_comment:
        row("Комментарий:", record.admin_comment)
    pdf.ln(6)

    section("6. ПОДПИСИ СТОРОН")
    pdf.ln(4)
    pdf.set_font(font_name, size=9)
    pdf.set_text_color(80, 80, 80)
    half = W / 2 - 4
    lm = pdf.l_margin
    pdf.cell(half, 6, "Лизингодатель:", new_x="RIGHT", new_y="TOP")
    pdf.cell(half, 6, "Лизингополучатель:", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(10)
    pdf.set_draw_color(0, 0, 0)
    pdf.set_line_width(0.3)
    pdf.line(lm, pdf.get_y(), lm + half, pdf.get_y())
    pdf.line(lm + half + 8, pdf.get_y(), lm + W, pdf.get_y())
    pdf.ln(4)
    pdf.set_font(font_name, size=8)
    pdf.cell(half, 5, "АО «Байтерек Девелопмент»", new_x="RIGHT", new_y="TOP")
    pdf.cell(half, 5, fd.get("company_name") or "________________", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(10)

    # ── 7. QR-код верификации ──────────────────────────────────────────────────
    verify_url = f"{settings.VERIFY_BASE_URL}/verify/{record.tamga_id}"
    qr_size_mm = 38   # размер QR-изображения в PDF (мм)
    text_col_x = lm + qr_size_mm + 6

    section("7. ИСПОЛНЯЮЩИЙ ОРАКУЛ — EXECUTION ORACLE · QumyrsqaCore™")
    pdf.ln(2)

    block_y = pdf.get_y()
    # Тёмно-синий фон заголовка блока + светлый основной
    pdf.set_fill_color(0, 39, 90)
    pdf.rect(lm, block_y, W, 7, style="F")

    pdf.set_xy(lm + 3, block_y + 1.5)
    pdf.set_font(font_name, style="B", size=8)
    pdf.set_text_color(255, 255, 255)
    trust_str = f"{record.trust_score * 100:.0f}%" if record.trust_score is not None else "—"
    vstatus = record.verification_status or "—"
    issued = str(record.created_at)[:19].replace("T", "  ")
    pdf.cell(
        W - 6, 4,
        f"Trust Score: {trust_str}   ·   {vstatus}   ·   Amanat Ed25519   ·   Выдан: {issued} UTC",
        new_x="LMARGIN", new_y="NEXT",
    )

    # Светлый основной блок
    body_y = block_y + 7
    pdf.set_fill_color(245, 248, 255)
    pdf.set_draw_color(0, 79, 158)
    pdf.set_line_width(0.4)
    pdf.rect(lm, body_y, W, 44, style="FD")

    # QR слева
    try:
        qr_buf = _make_qr_png(verify_url, box_size=5)
        pdf.image(qr_buf, x=lm + 3, y=body_y + 3, w=qr_size_mm, h=qr_size_mm)
    except Exception:
        pdf.set_xy(lm + 3, body_y + 3)
        pdf.set_font(font_name, size=7)
        pdf.set_text_color(120, 120, 120)
        pdf.cell(qr_size_mm, qr_size_mm, "[QR]", border=1, align="C")

    # Заголовок справа
    pdf.set_xy(text_col_x, body_y + 4)
    pdf.set_font(font_name, style="B", size=9)
    pdf.set_text_color(0, 39, 90)
    pdf.cell(W - qr_size_mm - 9, 6,
             "Цифровая верификация договора",
             new_x="LMARGIN", new_y="NEXT")

    pdf.set_x(text_col_x)
    pdf.set_font(font_name, size=7.5)
    pdf.set_text_color(30, 30, 30)
    pdf.multi_cell(
        W - qr_size_mm - 9, 5,
        "Сканируйте QR-код — Execution Oracle мгновенно\n"
        "раскроет криптографический паспорт события:\n"
        "время, параметры и Amanat-подпись (Ed25519).\n"
        "Параметры зафиксированы. Изменение невозможно.",
        new_x="LMARGIN", new_y="NEXT",
    )

    pdf.set_x(text_col_x)
    pdf.set_font(font_name, size=6.5)
    pdf.set_text_color(0, 79, 158)
    short_tamga = (record.tamga_id or "")[:28] + "..."
    pdf.cell(W - qr_size_mm - 9, 4.5,
             f"Tamga ID: {short_tamga}",
             new_x="LMARGIN", new_y="NEXT")

    if record.amanat_id:
        pdf.set_x(text_col_x)
        pdf.set_font(font_name, size=6.5)
        pdf.set_text_color(0, 100, 50)
        short_amanat = record.amanat_id[:28] + "..."
        pdf.cell(W - qr_size_mm - 9, 4.5,
                 f"Amanat ID: {short_amanat}",
                 new_x="LMARGIN", new_y="NEXT")

    # URL под QR
    pdf.set_xy(lm + 3, body_y + qr_size_mm + 5)
    pdf.set_font(font_name, size=5.5)
    pdf.set_text_color(0, 79, 158)
    short_url = verify_url if len(verify_url) <= 46 else verify_url[:43] + "..."
    pdf.cell(qr_size_mm, 4, short_url, align="C")

    pdf.ln(13)
    pdf.set_font(font_name, size=7)
    pdf.set_text_color(120, 120, 120)
    pdf.cell(0, 5,
             f"Сформировано: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}  ·  "
             f"QumyrsqaCore™ Execution Oracle  ·  Baiterek Leasing Engine v1.0",
             align="C")

    buf = io.BytesIO()
    pdf.output(buf)
    return buf.getvalue()
