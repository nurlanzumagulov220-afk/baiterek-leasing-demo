import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { fmt } from '../api'

export default function Cabinet() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [expandedApp, setExpandedApp] = useState<string | null>(null)
  const [tab, setTab] = useState<'apps' | 'calcs'>('apps')
  const nav = useNavigate()

  useEffect(() => {
    if (!localStorage.getItem('token')) { nav('/login'); return }
    api.get('/cabinet').then(r => { setData(r.data); setLoading(false) })
      .catch(() => { nav('/login') })
  }, [])

  if (loading) return <div className="container page"><p>Загрузка...</p></div>
  if (!data) return null

  const { user, stats, applications, calculations } = data

  return (
    <div className="container page">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="page-title">Личный кабинет</div>
          <div className="page-subtitle">{user.name} · {user.email}</div>
        </div>
        <button className="btn btn-primary" onClick={() => nav('/services')}>+ Подать заявку</button>
      </div>

      {/* Stats */}
      <div className="grid-3" style={{ marginBottom: 28 }}>
        {[
          { label: 'Всего заявок', val: stats.total_applications, icon: '📋' },
          { label: 'Одобрено', val: stats.approved, icon: '✅' },
          { label: 'Расчётов', val: stats.total_calculations, icon: '🧮' },
        ].map(s => (
          <div key={s.label} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 32 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--blue-dark)' }}>{s.val}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
        {(['apps', 'calcs'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: 600, fontSize: 14,
            color: tab === t ? 'var(--blue)' : 'var(--muted)',
            borderBottom: tab === t ? '2px solid var(--blue)' : '2px solid transparent',
            marginBottom: -2,
          }}>
            {t === 'apps' ? '📋 Мои заявки' : '🧮 Мои расчёты'}
          </button>
        ))}
      </div>

      {tab === 'apps' && (
        applications.length === 0 ? (
          <div className="empty-state card">
            <div className="empty-state-icon">📭</div>
            <p style={{ marginBottom: 16 }}>У вас пока нет заявок</p>
            <button className="btn btn-primary" onClick={() => nav('/services')}>Подать заявку</button>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Номер</th>
                  <th>Услуга</th>
                  <th>Статус</th>
                  <th>Trust</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((a: any) => {
                  const q = a.verification || {}
                  const score = q.trust_score
                  const reasons = q.rejection_reasons || []
                  const hasIssues = reasons.length > 0 && reasons[0] !== 'Все проверки пройдены успешно'
                  const isExpanded = expandedApp === a.app_id
                  return <>
                    <tr key={a.app_id} style={{ cursor: hasIssues ? 'pointer' : 'default' }}
                      onClick={() => hasIssues && setExpandedApp(isExpanded ? null : a.app_id)}>
                      <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{a.app_id.slice(0, 8).toUpperCase()}</td>
                      <td style={{ fontSize: 13 }}>{a.atom_id}</td>
                      <td>
                        <span className={`badge badge-${a.status}`}>{a.status_label}</span>
                        {hasIssues && <span style={{ marginLeft: 6, fontSize: 11, color: '#C0392B', cursor: 'pointer' }}>
                          ⚠ причины {isExpanded ? '▲' : '▼'}
                        </span>}
                      </td>
                      <td>
                        {score != null && (
                          <span style={{ fontWeight: 700, color: score >= 0.8 ? 'var(--green)' : '#C0392B', fontSize: 13 }}>
                            {(score * 100).toFixed(0)}%
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(a.created_at).toLocaleDateString('ru-RU')}</td>
                    </tr>
                    {isExpanded && hasIssues && (
                      <tr key={a.app_id + '_reasons'}>
                        <td colSpan={5} style={{ background: '#FFF5F5', padding: '12px 16px', borderTop: 'none' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#C0392B', marginBottom: 8 }}>
                            Причины низкой оценки от AI-модуля:
                          </div>
                          {reasons.map((r: string, i: number) => (
                            <div key={i} style={{ fontSize: 13, marginBottom: 4, display: 'flex', gap: 8 }}>
                              <span style={{ color: '#C0392B' }}>✗</span> {r}
                            </div>
                          ))}
                          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
                            Устраните замечания и подайте заявку повторно
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'calcs' && (
        calculations.length === 0 ? (
          <div className="empty-state card"><div className="empty-state-icon">🧮</div><p>Нет сохранённых расчётов</p></div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr><th>Продукт</th><th>Стоимость</th><th>Платёж/мес</th><th>Срок</th><th>Дата</th></tr>
              </thead>
              <tbody>
                {calculations.map((c: any) => (
                  <tr key={c.record_id}>
                    <td style={{ fontSize: 13 }}>{c.atom_id}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(c.equipment_cost)}</td>
                    <td style={{ fontWeight: 700, color: 'var(--blue-dark)' }}>{fmt(c.monthly_payment)}</td>
                    <td>{c.term_months} мес.</td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(c.created_at).toLocaleDateString('ru-RU')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
