import { useNavigate } from 'react-router-dom'

export default function Home() {
  const nav = useNavigate()
  return (
    <div>
      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #004F9E, #0066CC)', color: 'white', padding: '64px 24px', textAlign: 'center' }}>
        <div className="container">
          <div style={{ fontSize: 14, background: 'rgba(255,255,255,0.15)', display: 'inline-block', padding: '4px 16px', borderRadius: 20, marginBottom: 20, fontWeight: 600 }}>
            Единый портал поддержки бизнеса
          </div>
          <h1 style={{ fontSize: 40, fontWeight: 800, marginBottom: 16, lineHeight: 1.2 }}>
            Меры государственной<br />поддержки бизнеса
          </h1>
          <p style={{ fontSize: 18, opacity: 0.85, marginBottom: 32, maxWidth: 560, margin: '0 auto 32px' }}>
            70+ услуг Холдинга «Байтерек» — в одном окне.<br />
            Подайте заявку онлайн за несколько минут.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn" style={{ background: 'white', color: '#004F9E', fontSize: 16, padding: '12px 32px' }} onClick={() => nav('/services')}>
              Все услуги
            </button>
            <button className="btn btn-secondary" style={{ borderColor: 'rgba(255,255,255,0.5)', color: 'white', fontSize: 16, padding: '12px 32px' }} onClick={() => nav('/services')}>
              Лизинг вагонов →
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ background: '#F5A623', padding: '20px 24px' }}>
        <div className="container" style={{ display: 'flex', gap: 40, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[['70+', 'мер поддержки'], ['₸500 млрд', 'объём финансирования'], ['15 000+', 'поддержанных компаний'], ['5 мин', 'на подачу заявки']].map(([val, label]) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#1A2332' }}>{val}</div>
              <div style={{ fontSize: 13, color: '#4A3800' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Services preview */}
      <div className="container page">
        <div className="page-header">
          <div className="page-title">Популярные услуги</div>
          <div className="page-subtitle">Наиболее востребованные меры поддержки</div>
        </div>
        <div className="grid-3">
          {[
            { icon: '🚂', title: 'Лизинг вагонов — I этап', desc: 'Приобретение вагонов и авиатранспорта для индустриальных предприятий. Ставка от 18% годовых.', tag: 'Лизинг', id: 'leasing_wagons_s1' },
            { icon: '✈️', title: 'Лизинг вагонов — II этап', desc: 'Льготный лизинг для экспортёров. Ставка от 14% годовых, срок до 10 лет.', tag: 'Лизинг', id: 'leasing_wagons_s2' },
            { icon: '💼', title: 'Гарантирование займов', desc: 'Государственная гарантия по банковским кредитам для МСБ. Покрытие до 85%.', tag: 'Гарантии', id: null },
          ].map(s => (
            <div key={s.title} className="service-card" onClick={() => s.id && nav(`/services/${s.id}`)}>
              <div className="service-card-icon">{s.icon}</div>
              <div className="service-card-title">{s.title}</div>
              <div className="service-card-desc">{s.desc}</div>
              <div className="service-card-tag">{s.tag}</div>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 28 }}>
          <button className="btn btn-secondary" onClick={() => nav('/services')}>Смотреть все услуги →</button>
        </div>
      </div>

      {/* How it works */}
      <div style={{ background: '#EEF4FF', padding: '48px 24px' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div className="page-title">Как это работает</div>
          </div>
          <div className="grid-3">
            {[
              { step: '1', icon: '🔍', title: 'Выберите услугу', desc: 'Найдите подходящую меру поддержки в каталоге' },
              { step: '2', icon: '📝', title: 'Заполните форму', desc: 'Система автоматически рассчитает платежи и заполнит данные из eGov' },
              { step: '3', icon: '✅', title: 'Получите решение', desc: 'Отслеживайте статус заявки в личном кабинете' },
            ].map(s => (
              <div key={s.step} className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>{s.icon}</div>
                <div style={{ fontSize: 11, background: '#004F9E', color: 'white', borderRadius: 20, display: 'inline-block', padding: '2px 10px', marginBottom: 10, fontWeight: 700 }}>ШАГ {s.step}</div>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{s.title}</div>
                <div style={{ fontSize: 14, color: 'var(--muted)' }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
