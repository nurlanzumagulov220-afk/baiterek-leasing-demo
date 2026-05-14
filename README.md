# Smart Protection — Execution Oracle для Единого портала поддержки бизнеса

**No‑code конструктор услуг с криптографической защитой TAC.**

Проект разработан для хакатона АО «НИХ „Байтерек“» и решает задачу создания платформы, которая позволяет бизнес‑аналитикам без программирования собирать формы заявок, а предпринимателям — проходить двухэтапную подачу с автоматической верификацией и получением PDF‑договора, защищённого гибридной цифровой подписью.

---

## 🧩 Возможности

- **No‑code конструктор** — создание и настройка услуг лизинга, полей, валидации и логики переходов без правки кода.
- **Двухэтапная заявка** — понятный клиентский путь с масками ввода и автоматическим расчётом лизинговых платежей.
- **Криптографическая защита TAC** — каждый договор помещается в защищённый контейнер (Tamga Authenticated Container).
  - **Tamga** — Ed25519‑подпись события на edge‑устройстве.
  - **Tol** — консенсус трёх независимых источников и Trust Score.
  - **Amanat** — финальная подпись, подтверждающая истинность сделки.
- **QR‑код и публичный Execution Oracle** — QR в PDF ведёт на страницу `/verify/{tamga_id}`, где любой проверяющий видит криптографический паспорт сделки (время, Trust Score, подпись).
- **Mock‑интеграции** — готовность к обмену данными с ЕИШ и eGov.

---

## 🛠️ Технологический стек

- **Backend:** Python 3.11, FastAPI, SQLAlchemy, SQLite, ReportLab, qrcode, PyJWT
- **Frontend:** React + TypeScript, Vite, Chart.js
- **Криптография:** SHA‑256, Ed25519
- **Деплой:** Docker, Docker Compose, Nginx, Render, Vercel

---

## 🚀 Быстрый старт

### Локальный запуск (без Docker)

1. Клонируйте репозиторий:
   ```bash
   git clone https://github.com/nurlanzumagulov220-afk/baiterek-leasing-demo.git
   cd baiterek-leasing-demo
   ```

2. Запустите бэкенд:
   ```bash
   cd backend
   pip install -r requirements.txt
   cp .env.example .env
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

3. Запустите фронтенд (в новом терминале):
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. Откройте `http://localhost:5173` и войдите как администратор:  
   `admin@baiterek.kz` / `admin123`

### Запуск на VPS через Docker

1. Установите Docker на сервер:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```

2. Клонируйте репозиторий и перейдите в папку:
   ```bash
   git clone https://github.com/nurlanzumagulov220-afk/baiterek-leasing-demo.git
   cd baiterek-leasing-demo
   ```

3. Создайте файлы `Dockerfile.backend`, `Dockerfile.frontend`, `frontend/nginx.conf` и `docker-compose.yml` (примеры в корне репозитория).

4. Запустите стенд:
   ```bash
   docker compose up -d
   ```

5. Откройте `http://<IP-вашего-сервера>` — фронтенд на 80 порту, бэкенд на 8000.

> **Важно:** Чтобы QR‑коды в PDF работали, пропишите в `backend/.env` реальный IP:  
> `VERIFY_BASE_URL=http://<IP-вашего-сервера>:8000`

---

## 🎯 Демо‑стенд

Живая версия доступна по адресу:  
**[https://baiterek-leasing-demo.vercel.app](https://baiterek-leasing-demo.vercel.app)**

Данные для входа администратора:  
`admin@baiterek.kz` / `admin123`

---

## 👥 Команда

- **Нурлан (Kalb Master)** — архитектор, капитан, CEO  , nurlanzumagulov220@gmail.com
- **Кайсар (@momortis08-dev)** — API Gateway & Mobile Frontend Developer  
- **Джулиус (AI-агент Google)** — бэкенд, деплой, тестирование, фичи

---

## 📄 Лицензия

Проект распространяется под лицензией MIT. Подробнее см. в файле [LICENSE](LICENSE).
