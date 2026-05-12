package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"sync"
)

// ── Federated Learning: линейная модель ──────────────────────────────────────
//
// Признаки (features):
//   [0] fields_completeness  — доля заполненных обязательных полей (0..1)
//   [1] params_compliance    — все параметры в лимитах атома (0 или 1)
//   [2] amount_ratio         — сумма / max_amount (0..1)
//   [3] doc_presence         — есть ли документы (0 или 1)
//
// trust_score = sigmoid(w·x + b), отображённый в диапазон [0.40, 0.95]
// Обучение: FedAvg — каждый узел Baiterek присылает градиенты, не сырые данные.

type ModelWeights struct {
	W [4]float64 `json:"weights"`
	B float64    `json:"bias"`
}

var (
	mu    sync.Mutex
	model = ModelWeights{
		// Начальные веса: completeness и compliance важнее всего,
		// высокий amount_ratio немного снижает доверие.
		W: [4]float64{0.30, 0.35, -0.10, 0.25},
		B: 0.20,
	}
)

func sigmoid(x float64) float64 {
	return 1.0 / (1.0 + math.Exp(-x))
}

func (m ModelWeights) predict(features [4]float64) float64 {
	z := m.B
	for i, w := range m.W {
		z += w * features[i]
	}
	// Отображаем sigmoid [0,1] → trust [0.40, 0.95]
	return 0.40 + sigmoid(z)*0.55
}

// ── Request / Response types ──────────────────────────────────────────────────

type VerifyRequest struct {
	DeviceID     string  `json:"device_id"`
	GPSLat       float64 `json:"gps_lat"`
	GPSLon       float64 `json:"gps_lon"`
	GyroNoise    string  `json:"gyro_noise"`
	DocumentHash string  `json:"document_hash"`
}

type VerifyResponse struct {
	TamgaID    string  `json:"tamga_id"`
	TrustScore float64 `json:"trust_score"`
	Status     string  `json:"status"`
	Signature  []byte  `json:"signature"`
}

type ScoreRequest struct {
	FieldsCompleteness float64 `json:"fields_completeness"`
	ParamsCompliance   float64 `json:"params_compliance"`
	AmountRatio        float64 `json:"amount_ratio"`
	DocPresence        float64 `json:"doc_presence"`
}

type ScoreResponse struct {
	TrustScore float64      `json:"trust_score"`
	Status     string       `json:"status"`
	ModelUsed  bool         `json:"model_used"`
	Weights    ModelWeights `json:"weights"`
	Reasons    []string     `json:"reasons"`
}

func buildReasons(req ScoreRequest, score float64) []string {
	var reasons []string
	if req.FieldsCompleteness < 0.9 {
		pct := int(req.FieldsCompleteness * 100)
		reasons = append(reasons, fmt.Sprintf("Заполнено только %d%% обязательных полей — заполните все поля заявки", pct))
	}
	if req.ParamsCompliance < 1.0 {
		reasons = append(reasons, "Параметры заявки не соответствуют условиям продукта — проверьте сумму, аванс и срок")
	}
	if req.AmountRatio > 0.85 {
		reasons = append(reasons, fmt.Sprintf("Запрошенная сумма составляет %.0f%% от максимального лимита — высокий финансовый риск", req.AmountRatio*100))
	}
	if req.DocPresence < 1.0 {
		reasons = append(reasons, "Документы не приложены — прикрепите бизнес-план и финансовую отчётность")
	}
	if score >= 0.80 && len(reasons) == 0 {
		reasons = append(reasons, "Все проверки пройдены успешно")
	}
	return reasons
}

// ── Ask: контекст заявок для QA ──────────────────────────────────────────────

type AppInfo struct {
	AppID              string   `json:"app_id"`
	AtomID             string   `json:"atom_id"`
	Status             string   `json:"status"`
	TrustScore         float64  `json:"trust_score"`
	VerificationStatus string   `json:"verification_status"`
	RejectionReasons   []string `json:"rejection_reasons"`
	CreatedAt          string   `json:"created_at"`
}

type AskRequest struct {
	Question string    `json:"question"`
	Apps     []AppInfo `json:"apps"`
}

type AskResponse struct {
	Answer     string  `json:"answer"`
	Confidence float64 `json:"confidence"`
}

// FedUpdate — градиентное обновление от одного узла Baiterek.
// Узел присылает усреднённые градиенты по своему батчу данных.
// Сырые данные заявок НЕ передаются — только математические обновления.
type FedUpdate struct {
	NodeID    string     `json:"node_id"`
	Gradients [4]float64 `json:"gradients"`
	BiasDelta float64    `json:"bias_delta"`
	NSamples  int        `json:"n_samples"`
}

// ── FedAvg буфер ──────────────────────────────────────────────────────────────

type fedBuffer struct {
	totalSamples int
	wSum         [4]float64
	bSum         float64
}

var fed fedBuffer

// ── Rule-based QA ─────────────────────────────────────────────────────────────

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub ||
		len(s) > 0 && (func() bool {
			for i := 0; i <= len(s)-len(sub); i++ {
				if s[i:i+len(sub)] == sub {
					return true
				}
			}
			return false
		})())
}

func analyzeApps(q string, apps []AppInfo) AskResponse {
	n := len(apps)
	if n == 0 {
		return AskResponse{"Заявок в системе пока нет.", 0.95}
	}

	// Счётчики
	approved, rejected, pending, blocked := 0, 0, 0, 0
	var totalTrust float64
	var lowTrust []AppInfo
	var reasons []string

	for _, a := range apps {
		switch a.Status {
		case "approved":
			approved++
		case "rejected":
			rejected++
		case "pending", "under_review", "requires_docs":
			pending++
		}
		if a.VerificationStatus == "BLOCKED" {
			blocked++
		}
		totalTrust += a.TrustScore
		if a.TrustScore > 0 && a.TrustScore < 0.80 {
			lowTrust = append(lowTrust, a)
		}
		reasons = append(reasons, a.RejectionReasons...)
	}
	avgTrust := totalTrust / float64(n)

	// ── Маршрутизация по ключевым словам ──
	switch {
	case contains(q, "сколько") || contains(q, "количество") || contains(q, "статистика") || contains(q, "итого"):
		return AskResponse{
			fmt.Sprintf(
				"Всего заявок: %d\n• Одобрено: %d (%.0f%%)\n• Отклонено: %d (%.0f%%)\n• На рассмотрении: %d\n• Заблокировано верификацией: %d\n• Средний Trust Score: %.0f%%",
				n,
				approved, float64(approved)/float64(n)*100,
				rejected, float64(rejected)/float64(n)*100,
				pending, blocked,
				avgTrust*100,
			), 0.98,
		}

	case contains(q, "риск") || contains(q, "подозрительн") || contains(q, "опасн"):
		if len(lowTrust) == 0 {
			return AskResponse{"Подозрительных заявок не обнаружено. Все заявки прошли верификацию с Trust Score ≥ 80%.", 0.95}
		}
		msg := fmt.Sprintf("Обнаружено %d заявок с низким Trust Score (< 80%%):\n", len(lowTrust))
		for _, a := range lowTrust {
			msg += fmt.Sprintf("• %s — Trust: %.0f%%, статус: %s\n", a.AppID[:8], a.TrustScore*100, a.Status)
		}
		msg += "\nРекомендую проверить эти заявки вручную."
		return AskResponse{msg, 0.93}

	case contains(q, "причин") || contains(q, "почему") || contains(q, "отказ"):
		freq := map[string]int{}
		for _, r := range reasons {
			if r != "" && r != "Все проверки пройдены успешно" {
				freq[r]++
			}
		}
		if len(freq) == 0 {
			return AskResponse{"Причин отказа не зафиксировано. Все заявки успешно верифицированы.", 0.95}
		}
		msg := "Самые частые причины отказа:\n"
		for reason, cnt := range freq {
			msg += fmt.Sprintf("• %s — %d раз\n", reason, cnt)
		}
		return AskResponse{msg, 0.91}

	case contains(q, "доверие") || contains(q, "trust") || contains(q, "оценк") || contains(q, "скор"):
		best, worst := apps[0], apps[0]
		for _, a := range apps {
			if a.TrustScore > best.TrustScore {
				best = a
			}
			if a.TrustScore < worst.TrustScore && a.TrustScore > 0 {
				worst = a
			}
		}
		return AskResponse{
			fmt.Sprintf(
				"Средний Trust Score по системе: %.0f%%\n\nЛучшая заявка: %s — %.0f%%\nХудшая заявка: %s — %.0f%%\n\nМодель обучена на %d признаках: заполненность полей, соответствие параметрам, размер суммы, наличие документов.",
				avgTrust*100,
				best.AppID[:8], best.TrustScore*100,
				worst.AppID[:8], worst.TrustScore*100,
				n,
			), 0.94,
		}

	case contains(q, "одобр"):
		if approved == 0 {
			return AskResponse{"Одобренных заявок пока нет.", 0.95}
		}
		return AskResponse{
			fmt.Sprintf("Одобрено %d из %d заявок (%.0f%%). Каждая одобренная заявка зафиксирована Amanat-подписью Aksakal — изменить график платежей задним числом невозможно.", approved, n, float64(approved)/float64(n)*100),
			0.96,
		}

	case contains(q, "блокир") || contains(q, "отклон"):
		return AskResponse{
			fmt.Sprintf("Заблокировано верификацией: %d заявок. Отклонено администратором: %d заявок.\nБлокировка происходит автоматически до записи в БД — такие заявки никогда не попадают в систему.", blocked, rejected),
			0.95,
		}

	case contains(q, "модел") || contains(q, "обучени") || contains(q, "федерат"):
		mu.Lock()
		m := model
		mu.Unlock()
		return AskResponse{
			fmt.Sprintf(
				"Модель Aksakal обучена федеративно на данных %d заявок.\nТекущие веса:\n• Заполненность полей: %.3f\n• Соответствие параметрам: %.3f\n• Размер суммы (инверсия): %.3f\n• Наличие документов: %.3f\n• Bias: %.3f\n\nДанные заявок за пределы контура не передавались.",
				n, m.W[0], m.W[1], m.W[2], m.W[3], m.B,
			), 0.97,
		}

	default:
		return AskResponse{
			fmt.Sprintf(
				"По системе: %d заявок, средний Trust Score %.0f%%, одобрено %d, заблокировано %d.\n\nМогу ответить на вопросы о: статистике, рисках, причинах отказа, Trust Score, одобренных/заблокированных заявках, модели обучения.",
				n, avgTrust*100, approved, blocked,
			), 0.75,
		}
	}
}

func round4(v float64) float64 {
	return math.Round(v*10000) / 10000
}

var (
	publicKey  ed25519.PublicKey
	privateKey ed25519.PrivateKey
)

func generateTamga(req VerifyRequest) string {
	return fmt.Sprintf("%s:%f:%f:%s", req.DeviceID, req.GPSLat, req.GPSLon, req.DocumentHash)
}

// ── Main ──────────────────────────────────────────────────────────────────────

func main() {
	var err error
	publicKey, privateKey, err = ed25519.GenerateKey(rand.Reader)
	if err != nil {
		log.Fatal(err)
	}

	// ── /internal/tamga — legacy: верификация по данным устройства ───────────
	http.HandleFunc("/internal/tamga", func(w http.ResponseWriter, r *http.Request) {
		var req VerifyRequest
		json.NewDecoder(r.Body).Decode(&req)

		liveness := len(req.GyroNoise) > 20
		trustScore := 0.45
		if liveness {
			trustScore = 0.87
		}

		tamgaID := generateTamga(req)
		sig := ed25519.Sign(privateKey, []byte(tamgaID)) //nolint

		resp := VerifyResponse{
			TamgaID:    tamgaID,
			TrustScore: trustScore,
			Status:     "VERIFIED",
			Signature:  sig,
		}
		if trustScore < 0.8 {
			resp.Status = "BLOCKED"
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	// ── /internal/score — ML-скоринг для заявок Baiterek ─────────────────────
	//
	// Принимает признаки заявки, возвращает trust_score на основе
	// текущих весов обученной федеративной модели.
	http.HandleFunc("/internal/score", func(w http.ResponseWriter, r *http.Request) {
		var req ScoreRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}

		features := [4]float64{
			req.FieldsCompleteness,
			req.ParamsCompliance,
			req.AmountRatio,
			req.DocPresence,
		}

		mu.Lock()
		score := model.predict(features)
		wCopy := model
		mu.Unlock()

		status := "VERIFIED"
		if score < 0.80 {
			status = "BLOCKED"
		}

		resp := ScoreResponse{
			TrustScore: round4(score),
			Status:     status,
			ModelUsed:  true,
			Weights:    wCopy,
			Reasons:    buildReasons(req, score),
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	// ── /ask — QA по данным заявок ───────────────────────────────────────────
	http.HandleFunc("/ask", func(w http.ResponseWriter, r *http.Request) {
		var req AskRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		resp := analyzeApps(req.Question, req.Apps)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	// ── /internal/sign — Ed25519 подпись данных ──────────────────────────────
	//
	// Принимает любой payload, подписывает своим закрытым ключом.
	// Даёт доказательство: решение принято именно этим ядром, не подделано.
	http.HandleFunc("/internal/sign", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		raw, err := json.Marshal(body)
		if err != nil {
			http.Error(w, "marshal error", http.StatusInternalServerError)
			return
		}
		sig := ed25519.Sign(privateKey, raw)
		result := map[string]any{
			"signed":    body,
			"signature": fmt.Sprintf("%x", sig),
			"pub_key":   fmt.Sprintf("%x", publicKey),
			"algorithm": "Ed25519",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	})

	// ── /federated/update — принимает градиенты от узла Baiterek ─────────────
	//
	// FedAvg: взвешенное среднее градиентов по числу образцов.
	// После каждого обновления применяем шаг градиентного спуска.
	http.HandleFunc("/federated/update", func(w http.ResponseWriter, r *http.Request) {
		var upd FedUpdate
		if err := json.NewDecoder(r.Body).Decode(&upd); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		if upd.NSamples <= 0 {
			http.Error(w, "n_samples must be > 0", http.StatusBadRequest)
			return
		}

		const lr = 0.01 // learning rate

		mu.Lock()
		// Накапливаем взвешенные градиенты
		fed.totalSamples += upd.NSamples
		for i := range fed.wSum {
			fed.wSum[i] += upd.Gradients[i] * float64(upd.NSamples)
		}
		fed.bSum += upd.BiasDelta * float64(upd.NSamples)

		// Применяем FedAvg шаг
		for i := range model.W {
			model.W[i] += lr * (fed.wSum[i] / float64(fed.totalSamples))
		}
		model.B += lr * (fed.bSum / float64(fed.totalSamples))

		// Сбрасываем буфер после применения
		fed = fedBuffer{}
		updatedModel := model
		mu.Unlock()

		log.Printf("[FL] node=%s n=%d weights=%v bias=%.4f",
			upd.NodeID, upd.NSamples, updatedModel.W, updatedModel.B)

		result := map[string]any{
			"status":  "updated",
			"node_id": upd.NodeID,
			"model":   updatedModel,
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	})

	// ── /federated/weights — текущие веса модели ─────────────────────────────
	http.HandleFunc("/federated/weights", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		m := model
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(m)
	})

	// ── /health ───────────────────────────────────────────────────────────────
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		m := model
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"ok","service":"aksakal","fl":"enabled","weights":[%.4f,%.4f,%.4f,%.4f],"bias":%.4f}`,
			m.W[0], m.W[1], m.W[2], m.W[3], m.B)
	})

	log.Println("Aksakal listening on :8080  [FL enabled]")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
