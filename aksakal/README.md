# Aksakal — Суверенный AI-мозг

Go-сервис внутри контура Байтерека. Работает без интернета.

## Запуск

```bash
go run aksakal.go
# → :8080
```

## Эндпоинты

| Метод | URL | Описание |
|-------|-----|----------|
| POST | `/internal/score` | ML-скоринг заявки по 4 признакам |
| POST | `/internal/sign` | Ed25519 подпись данных |
| POST | `/federated/update` | Принять градиент от узла (FedAvg) |
| GET | `/federated/weights` | Текущие веса модели |
| POST | `/ask` | QA по метрикам заявок |
| GET | `/health` | Статус + текущие веса |

## Модель (4 признака)

```
trust_score = 0.40 + sigmoid(
  0.30 × fields_completeness +
  0.35 × params_compliance  +
 -0.10 × amount_ratio       +
  0.25 × doc_presence       +
  0.10
) × 0.55
```

Порог: `≥ 0.80 → VERIFIED`, `< 0.80 → BLOCKED`

Веса дообучаются федеративно — без передачи сырых данных.
