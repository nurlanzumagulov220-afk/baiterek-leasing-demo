from pathlib import Path

FONTS_DIR = Path(__file__).parent / "fonts"

APP_STATUSES: dict[str, str] = {
    "pending":       "На рассмотрении",
    "under_review":  "Проверка документов",
    "approved":      "Одобрено",
    "rejected":      "Отклонено",
    "requires_docs": "Требуются документы",
}
