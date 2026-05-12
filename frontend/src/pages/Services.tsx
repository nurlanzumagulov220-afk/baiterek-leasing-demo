import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

const ICONS: Record<string, string> = {
  leasing: '🚂',
  guarantee: '🛡️',
  grant: '💰',
  default: '📋',
}

export default function Services() {
  const [atoms, setAtoms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const nav = useNavigate()

  useEffect(() => {
    api.get('/atoms').then(r => { setAtoms(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="container page"><p>Загрузка...</p></div>

  return (
    <div className="container page">
      <div className="page-header">
        <div className="page-title">Каталог услуг</div>
        <div className="page-subtitle">Выберите меру поддержки для подачи заявки</div>
      </div>
      {atoms.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <p>Услуги не найдены</p>
        </div>
      ) : (
        <div className="grid-3">
          {atoms.map(a => (
            <div key={a.atom_id} className="service-card" onClick={() => nav(`/services/${a.atom_id}`)}>
              <div className="service-card-icon">{ICONS[a.category] || ICONS.default}</div>
              <div className="service-card-title">{a.product_name}</div>
              <div className="service-card-desc">{a.description}</div>
              <div className="service-card-tag">{a.category || 'Услуга'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
