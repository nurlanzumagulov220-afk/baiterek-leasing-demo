import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

export default function Admin() {
  const [atoms, setAtoms] = useState<any[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [json, setJson] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [apps, setApps] = useState<any[]>([])
  const [expandedApp, setExpandedApp] = useState<string | null>(null)
  const [tab, setTab] = useState<'atoms' | 'apps' | 'xai'>('atoms')
  const [askQuestion, setAskQuestion] = useState('')
  const [askAnswer, setAskAnswer] = useState<any>(null)
  const [askLoading, setAskLoading] = useState(false)
  const [newAtomId, setNewAtomId] = useState('')
  const [xaiWeights, setXaiWeights] = useState<any>(null)
  const [xaiLoading, setXaiLoading] = useState(false)
  const nav = useNavigate()

  const isAdmin = localStorage.getItem('is_admin') === 'true'

  useEffect(() => {
    if (!localStorage.getItem('token') || !isAdmin) { nav('/login'); return }
    loadAtoms()
    loadApps()
  }, [])

  function loadAtoms() {
    api.get('/atoms').then(r => setAtoms(r.data))
  }

  function loadApps() {
    api.get('/applications').then(r => setApps(r.data)).catch(() => {})
  }

  async function selectAtom(atomId: string) {
    setSelected(atomId)
    setMsg('')
    setJsonError('')
    const r = await api.get(`/atoms/${atomId}`)
    setJson(JSON.stringify(r.data, null, 2))
  }

  async function saveAtom() {
    if (!selected) return
    try {
      const parsed = JSON.parse(json)
      setJsonError('')
      setSaving(true)
      await api.put(`/atoms/${selected}`, { data: parsed })
      setMsg('✅ Атом сохранён. Изменения вступили в силу немедленно для всех пользователей.')
      loadAtoms()
    } catch (e: any) {
      setJsonError(e.message?.includes('JSON') ? 'Ошибка JSON: ' + e.message : e.response?.data?.detail || e.message)
    }
    setSaving(false)
  }

  async function createAtom() {
    if (!newAtomId.trim()) return
    const template = {
      atom_id: newAtomId,
      version: '1.0.0',
      product_name: 'Новая услуга',
      category: 'general',
      description: 'Описание услуги',
      logic_math: 'none',
      params: {},
      steps: [
        {
          step: 1,
          title: 'Шаг 1',
          fields: [
            { id: 'field_1', label: 'Поле 1', type: 'text', validation: { required: true } },
          ],
        },
      ],
    }
    try {
      await api.post('/atoms', { atom_id: newAtomId, data: template })
      setNewAtomId('')
      loadAtoms()
      selectAtom(newAtomId)
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Ошибка')
    }
  }

  async function deleteAtom(atomId: string) {
    if (!confirm(`Удалить атом "${atomId}"?`)) return
    await api.delete(`/atoms/${atomId}`)
    if (selected === atomId) { setSelected(null); setJson('') }
    loadAtoms()
  }

  async function updateStatus(appId: string, status: string) {
    await api.patch(`/applications/${appId}/status`, { status })
    loadApps()
  }

  async function loadXaiWeights() {
    setXaiLoading(true)
    try {
      const r = await api.get('/admin/federated-weights')
      setXaiWeights(r.data)
    } catch {
      setXaiWeights(null)
    }
    setXaiLoading(false)
  }

  async function askAksakal() {
    if (!askQuestion.trim()) return
    setAskLoading(true)
    setAskAnswer(null)
    try {
      const r = await api.post('/admin/ask-aksakal', { question: askQuestion })
      setAskAnswer(r.data)
    } catch {
      setAskAnswer({ answer: 'Ошибка соединения с Aksakal', confidence: 0 })
    }
    setAskLoading(false)
  }

  const STATUSES = ['pending', 'under_review', 'approved', 'rejected', 'requires_docs']
  const STATUS_LABELS: Record<string, string> = {
    pending: 'На рассмотрении', under_review: 'Проверка', approved: 'Одобрено', rejected: 'Отклонено', requires_docs: 'Нужны документы',
  }

  return (
    <div className="container page">
      <div className="page-header">
        <div className="page-title">⚙️ Конструктор форм</div>
        <div className="page-subtitle">Управление атомами услуг и заявками без программирования</div>
      </div>

      {/* Aksakal Ask */}
      <div className="card" style={{ marginBottom: 24, background: '#F8FAFF', border: '1.5px solid var(--blue)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 22 }}>🧠</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Спросить Аксакала</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Суверенный AI-анализ по логам и метрикам заявок</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="form-input"
            placeholder="Например: сколько заявок одобрено? или: есть ли подозрительные заявки?"
            value={askQuestion}
            onChange={e => setAskQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && askAksakal()}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={askAksakal} disabled={askLoading}>
            {askLoading ? '...' : 'Спросить'}
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
          Темы: статистика · риски · причины отказа · Trust Score · модель · одобренные · заблокированные
        </div>
        {askAnswer && (
          <div style={{ marginTop: 16, padding: '14px 16px', background: '#fff', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: 1 }}>
                Aksakal отвечает
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                уверенность: {((askAnswer.confidence || 0) * 100).toFixed(0)}%
              </div>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-line', color: '#1a1a2e' }}>
              {askAnswer.answer}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid var(--border)' }}>
        {(['atoms', 'apps', 'xai'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); if (t === 'xai' && !xaiWeights) loadXaiWeights() }} style={{
            padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: 600, fontSize: 14,
            color: tab === t ? 'var(--blue)' : 'var(--muted)',
            borderBottom: tab === t ? '2px solid var(--blue)' : '2px solid transparent',
            marginBottom: -2,
          }}>
            {t === 'atoms' ? '🧩 Атомы услуг' : t === 'apps' ? `📋 Заявки (${apps.length})` : '🧬 XAI Веса'}
          </button>
        ))}
      </div>

      {tab === 'atoms' && (
        <div className="grid-2" style={{ gap: 24, alignItems: 'start' }}>
          {/* Left: list */}
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Список атомов</div>
              {atoms.map(a => (
                <div key={a.atom_id} onClick={() => selectAtom(a.atom_id)}
                  style={{
                    padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 6,
                    background: selected === a.atom_id ? '#EEF4FF' : '#F8FAFF',
                    border: `1.5px solid ${selected === a.atom_id ? 'var(--blue)' : 'var(--border)'}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{a.product_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{a.atom_id}</div>
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={e => { e.stopPropagation(); deleteAtom(a.atom_id) }}>✕</button>
                </div>
              ))}
            </div>

            {/* Create new */}
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 12 }}>+ Создать атом</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form-input" placeholder="atom_id (напр. grant_sme)" value={newAtomId}
                  onChange={e => setNewAtomId(e.target.value.replace(/\s/g, '_').toLowerCase())} />
                <button className="btn btn-primary btn-sm" onClick={createAtom}>Создать</button>
              </div>
              <div className="form-hint" style={{ marginTop: 6 }}>
                Используйте snake_case. Атом появится как новая услуга в каталоге немедленно.
              </div>
            </div>
          </div>

          {/* Right: editor */}
          <div>
            {selected ? (
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontWeight: 700 }}>Редактор: <span style={{ color: 'var(--blue)' }}>{selected}</span></div>
                  <button className="btn btn-primary btn-sm" onClick={saveAtom} disabled={saving}>
                    {saving ? 'Сохранение...' : '💾 Сохранить'}
                  </button>
                </div>
                {msg && <div className="alert alert-success">{msg}</div>}
                {jsonError && <div className="alert alert-error">⚠️ {jsonError}</div>}
                <div className="alert alert-info" style={{ marginBottom: 12 }}>
                  📡 Изменения вступают в силу мгновенно. Никакого деплоя не требуется.
                </div>
                <textarea className="json-editor" value={json} onChange={e => { setJson(e.target.value); setJsonError(''); setMsg('') }} />
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
                  Измените <code>rate_annual_pct</code> — ставка изменится для всех пользователей немедленно
                </div>
              </div>
            ) : (
              <div className="card empty-state">
                <div className="empty-state-icon">🧩</div>
                <p>Выберите атом для редактирования</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'apps' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {apps.length === 0 ? (
            <div className="empty-state" style={{ padding: 48 }}><div className="empty-state-icon">📭</div><p>Заявок пока нет</p></div>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Номер</th><th>Услуга</th><th>Статус</th><th>Trust</th><th>Дата</th><th>Действие</th><th>PDF</th></tr>
              </thead>
              <tbody>
                {apps.map((a: any) => {
                  const q = a.verification || {}
                  const score = q.trust_score
                  const reasons = q.rejection_reasons || []
                  const isExpanded = expandedApp === a.app_id
                  return <>
                    <tr key={a.app_id} style={{ cursor: 'pointer' }} onClick={() => setExpandedApp(isExpanded ? null : a.app_id)}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.app_id.slice(0, 8).toUpperCase()}</td>
                      <td style={{ fontSize: 13 }}>{a.atom_id}</td>
                      <td><span className={`badge badge-${a.status}`}>{a.status_label}</span></td>
                      <td>
                        {score != null && (
                          <span style={{ fontWeight: 700, color: score >= 0.8 ? 'var(--green)' : '#C0392B', fontSize: 13 }}>
                            {(score * 100).toFixed(0)}%
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(a.created_at).toLocaleDateString('ru-RU')}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <select className="form-input form-select" style={{ padding: '4px 28px 4px 8px', fontSize: 12, width: 'auto' }}
                          value={a.status} onChange={e => updateStatus(a.app_id, e.target.value)}>
                          {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                        </select>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: 11, padding: '3px 8px' }}
                          onClick={async () => {
                            const token = localStorage.getItem('token')
                            const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/applications/${a.app_id}/contract.pdf`, {
                              headers: { Authorization: `Bearer ${token}` }
                            })
                            const blob = await res.blob()
                            const url = URL.createObjectURL(blob)
                            const link = document.createElement('a')
                            link.href = url
                            link.download = `contract_${a.app_id.slice(0, 8).toUpperCase()}.pdf`
                            link.click()
                            URL.revokeObjectURL(url)
                          }}
                        >
                          📄 PDF
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={a.app_id + '_detail'}>
                        <td colSpan={6} style={{ background: '#F8FAFF', padding: '12px 16px' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>
                            AI ВЕРИФИКАЦИЯ
                          </div>
                          <div style={{ display: 'flex', gap: 24, marginBottom: 8, flexWrap: 'wrap' }}>
                            {[
                              ['Tamga ID', q.tamga_id ? q.tamga_id.slice(0, 16) + '...' : '—'],
                              ['Trust Score', score != null ? `${(score * 100).toFixed(0)}%` : '—'],
                              ['Статус верификации', q.verification_status || '—'],
                              ['Amanat ID', q.amanat_id ? q.amanat_id.slice(0, 16) + '...' : '—'],
                            ].map(([label, val]) => (
                              <div key={label}>
                                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</div>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{val}</div>
                              </div>
                            ))}
                          </div>
                          {reasons.length > 0 && (
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: reasons[0] === 'Все проверки пройдены успешно' ? 'var(--green)' : '#C0392B', marginBottom: 4 }}>
                                {reasons[0] === 'Все проверки пройдены успешно' ? '✓ Причины' : '✗ Причины отказа'}
                              </div>
                              {reasons.map((r: string, i: number) => (
                                <div key={i} style={{ fontSize: 13, marginBottom: 2, color: r === 'Все проверки пройдены успешно' ? 'var(--green)' : '#333' }}>
                                  {r === 'Все проверки пройдены успешно' ? '✓' : '·'} {r}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
      {tab === 'xai' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Федеративные веса модели Aksakal</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                Модель обучается на данных узлов Baiterek без передачи сырых заявок (FedAvg)
              </div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={loadXaiWeights} disabled={xaiLoading}>
              {xaiLoading ? '...' : '↻ Обновить'}
            </button>
          </div>

          {xaiLoading && <div className="card"><p style={{ color: 'var(--muted)' }}>Загрузка весов из Aksakal...</p></div>}

          {xaiWeights && (
            <>
              {/* Статус источника */}
              <div className="card" style={{ marginBottom: 16, background: xaiWeights.status === 'live' ? '#F0FFF4' : '#FFFBEB', border: `1px solid ${xaiWeights.status === 'live' ? '#C6F6D5' : '#FDE68A'}` }}>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Источник</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {xaiWeights.status === 'live' ? '🟢 Aksakal (live)' : '🟡 Дефолтные веса'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Federated Learning</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{xaiWeights.federated_learning ? '✓ Активно' : '— Нет данных'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Bias</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{xaiWeights.bias}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Формула</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)' }}>{xaiWeights.formula}</div>
                  </div>
                </div>
              </div>

              {/* Веса признаков */}
              <div className="card">
                <div style={{ fontWeight: 700, marginBottom: 16 }}>Веса признаков</div>
                {xaiWeights.features?.map((f: any) => {
                  const w = f.weight as number
                  const absW = Math.abs(w)
                  const maxW = 0.5
                  const barWidth = Math.min(absW / maxW * 100, 100)
                  const isNeg = w < 0
                  const barColor = isNeg ? '#C0392B' : 'var(--blue)'
                  return (
                    <div key={f.id} style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{f.label}</span>
                          <span style={{ marginLeft: 8, fontSize: 11, color: isNeg ? '#C0392B' : 'var(--green)', fontWeight: 600 }}>
                            {isNeg ? '▼ снижает' : '▲ повышает'} Trust Score
                          </span>
                        </div>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: barColor }}>
                          {w > 0 ? '+' : ''}{w.toFixed(4)}
                        </span>
                      </div>
                      <div style={{ background: '#F0F4F8', borderRadius: 6, height: 12, overflow: 'hidden', position: 'relative' }}>
                        <div style={{
                          position: 'absolute',
                          left: isNeg ? `${50 - barWidth / 2}%` : '50%',
                          width: `${barWidth / 2}%`,
                          height: '100%',
                          background: barColor,
                          borderRadius: 6,
                          transition: 'width 0.5s ease',
                        }} />
                        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#CBD5E0' }} />
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{f.description}</div>
                    </div>
                  )
                })}
              </div>

              {/* Интерпретация */}
              <div className="card" style={{ marginTop: 16, background: '#F8FAFF', border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Как читать веса</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.8 }}>
                  Положительный вес (синий) — признак повышает Trust Score.<br />
                  Отрицательный вес (красный) — признак снижает Trust Score.<br />
                  Порог блокировки: Trust Score &lt; 0.80 → заявка BLOCKED.<br />
                  Модель обновляется автоматически через FedAvg после каждых 10 заявок.
                </div>
              </div>
            </>
          )}

          {!xaiWeights && !xaiLoading && (
            <div className="card empty-state">
              <div className="empty-state-icon">🧬</div>
              <p>Нажмите «Обновить» для загрузки весов из Aksakal</p>
              <button className="btn btn-primary" onClick={loadXaiWeights}>Загрузить</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
