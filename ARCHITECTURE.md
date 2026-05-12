# Архитектура системы

## Компоненты

```
┌─────────────────────────────────────────────────────────────┐
│                    КОНТУР БАЙТЕРЕКА                         │
│                                                             │
│  ┌──────────────┐    ┌──────────────────────────────────┐   │
│  │   Frontend   │    │         FastAPI Backend          │   │
│  │  React + TS  │◄──►│                                  │   │
│  │   :5173      │    │  /atoms          (конструктор)   │   │
│  └──────────────┘    │  /calculate      (калькулятор)   │   │
│                      │  /applications   (заявки)        │   │
│                      │  /cabinet        (кабинет)       │   │
│                      │  /mock/egov      (eGov mock)     │   │
│                      │  /mock/eis       (ЕИШ mock)      │   │
│                      │        │                         │   │
│                      │  ┌─────▼──────────────────────┐  │   │
│                      │  │   Модуль верификации         │  │   │
│                      │  │   verification_layer.py     │  │   │
│                      │  │                             │  │   │
│                      │  │  stamp_atom()               │  │   │
│                      │  │    └─ SHA-256 атома         │  │   │
│                      │  │                             │  │   │
│                      │  │  verify_tol()               │  │   │
│                      │  │    ├─ tamper_check           │  │   │
│                      │  │    ├─ params_check           │  │   │
│                      │  │    └─ fields_check           │  │   │
│                      │  │                             │  │   │
│                      │  │  settle_amanat()            │  │   │
│                      │  │    └─ SHA-256 графика       │  │   │
│                      │  └────────────┬────────────────┘  │   │
│                      │               │ HTTP              │   │
│                      └───────────────┼──────────────────┘   │
│                                      │                       │
│                      ┌───────────────▼──────────────────┐   │
│                      │        Aksakal (Go) :8080        │   │
│                      │                                  │   │
│                      │  /internal/score                 │   │
│                      │    └─ Linear model (4 features)  │   │
│                      │                                  │   │
│                      │  /internal/sign                  │   │
│                      │    └─ Ed25519 подпись            │   │
│                      │                                  │   │
│                      │  /federated/update               │   │
│                      │    └─ FedAvg агрегация           │   │
│                      │                                  │   │
│                      │  /ask                            │   │
│                      │    └─ QA по метрикам заявок      │   │
│                      └──────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                    Данные не покидают контур (п. 5 ТЗ)
```

---

## Три момента верификации (аналогия: ресторан)

### 1. Tamga — штамп на меню
```
Admin создаёт атом (продукт)
    → stamp_atom(atom_data)
    → SHA-256(JSON без tamga_id) = atom_tamga_id
    → Сохраняется в atom JSON
```
Любое тихое изменение параметров → другой хеш → подделка видна.

### 2. Tol — официант проверяет заказ
```
Предприниматель подаёт заявку
    → verify_tol(atom, form_data)
    │
    ├─ tamper_check: SHA-256(атом) == atom_tamga_id ?
    ├─ params_check: сумма/аванс/срок в лимитах атома ?
    ├─ fields_check: все обязательные поля заполнены ?
    │
    ├─ Aksakal /internal/score → ML trust_score (4 признака)
    │
    └─ Консенсус ≥ 2/3 + trust ≥ 0.80 → VERIFIED
                                       → BLOCKED (не попадает в БД)
```

### 3. Amanat — подписанный чек
```
Admin одобряет заявку
    → calc_annuity(params) → schedule[]
    → settle_amanat(app_id, tamga_id, schedule, atom_tamga_id)
    → SHA-256(payload) = amanat_id
    → Aksakal /internal/sign → Ed25519(amanat_id)
    → Сохраняется в БД
```
Изменить график задним числом → amanat_id не совпадёт.

---

## Федеративное обучение Aksakal

```
Узел Байтерека (после 10 заявок):
    Признаки: [completeness, compliance, amount_ratio, doc_presence]
    Локальный градиент: err × feature для каждого признака
    push_gradient() → POST /federated/update
    
Aksakal:
    FedAvg: Σ(gradient_i × n_samples_i) / Σ(n_samples_i)
    model.W[i] += lr × grad_avg
    
Данные заявок: остаются в контуре.
Наружу уходят: только числа градиентов.
```

---

## Модель данных

```
Application
├── app_id          UUID
├── atom_id         FK → atoms/*.json
├── form_data       JSON (произвольные поля формы)
├── status          pending|under_review|approved|rejected
├── eis_ref         EIS-XXXXXXXX
│
└── [Модуль верификации]
    ├── tamga_id            SHA-256 заявки
    ├── atom_tamga_id       SHA-256 атома на момент подачи
    ├── trust_score         0.0 — 1.0
    ├── verification_status VERIFIED | BLOCKED
    ├── rejection_reasons   JSON[]
    ├── amanat_id           SHA-256 графика платежей
    └── amanat_signature    Ed25519 hex
```
