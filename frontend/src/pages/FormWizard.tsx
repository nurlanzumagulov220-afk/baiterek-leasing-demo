import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api, { fmt } from '../api'

function calcAnnuity(principal: number, rateAnnual: number, months: number): number {
  const r = rateAnnual / 100 / 12
  if (r === 0) return principal / months
  return principal * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1)
}

function evalCalc(formula: string, values: Record<string, any>, params: any): number {
  if (formula.startsWith('annuity(')) {
    const principal = values['principal'] || 0
    const rate = params?.rate_annual_pct || 18
    const months = Number(values['term_months']) || 12
    return calcAnnuity(principal, rate, months)
  }
  try {
    // Simple formula eval: replace field names with values
    let expr = formula
    Object.entries(values).forEach(([k, v]) => {
      expr = expr.replace(new RegExp(`\\b${k}\\b`, 'g'), String(Number(v) || 0))
    })
    expr = expr.replace(/params\.rate_annual_pct/g, String(params?.rate_annual_pct || 18))
    // eslint-disable-next-line no-new-func
    return new Function(`return ${expr}`)()
  } catch { return 0 }
}

export default function FormWizard() {
  const { atomId } = useParams<{ atomId: string }>()
  const nav = useNavigate()
  const [atom, setAtom] = useState<any>(null)
  const [step, setStep] = useState(0)
  const [values, setValues] = useState<Record<string, any>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<any>(null)
  const [blocked, setBlocked] = useState<any>(null)
  const [egovLoading, setEgovLoading] = useState(false)

  useEffect(() => {
    api.get(`/atoms/${atomId}`).then(r => { setAtom(r.data); setLoading(false) })
      .catch(() => nav('/services'))
  }, [atomId])

  // Recalculate derived fields whenever values change
  useEffect(() => {
    if (!atom) return
    const allFields = atom.steps.flatMap((s: any) => s.fields)
    const calcFields = allFields.filter((f: any) => f.type === 'calculated')
    if (!calcFields.length) return
    const newVals = { ...values }
    let changed = false
    calcFields.forEach((f: any) => {
      const result = evalCalc(f.formula, newVals, atom.params)
      const rounded = Math.round(result)
      if (newVals[f.id] !== rounded) { newVals[f.id] = rounded; changed = true }
    })
    if (changed) setValues(newVals)
  }, [values.equipment_cost, values.advance_pct, values.term_months, atom])

  async function prefillEgov() {
    const bin = values.bin || ''
    if (bin.length !== 12) return
    setEgovLoading(true)
    try {
      const r = await api.post('/mock/egov/bin', { bin })
      setValues(v => ({ ...v, company_name: r.data.company_name, director_name: r.data.director_name }))
    } catch {}
    setEgovLoading(false)
  }

  function validate(stepIndex: number): boolean {
    const fields = atom.steps[stepIndex].fields
    const errs: Record<string, string> = {}
    fields.forEach((f: any) => {
      if (f.type === 'calculated') return
      const val = values[f.id]
      const v = f.validation || {}
      if (f.type === 'file') {
        if (v.required && !val) errs[f.id] = 'Прикрепите файл'
        return
      }
      if (v.required && (val === undefined || val === '' || val === null || val === false)) {
        errs[f.id] = 'Обязательное поле'
      } else if (val !== undefined && val !== '') {
        if (v.min !== undefined && Number(val) < v.min) errs[f.id] = `Минимум: ${v.min.toLocaleString()}`
        if (v.max !== undefined && Number(val) > v.max) errs[f.id] = `Максимум: ${v.max.toLocaleString()}`
        if (v.length && String(val).length !== v.length) errs[f.id] = `Должно быть ${v.length} символов`
        if (v.pattern && !new RegExp(v.pattern).test(String(val))) errs[f.id] = 'Неверный формат'
      }
    })
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function next() {
    if (!validate(step)) return
    setStep(s => s + 1)
    window.scrollTo(0, 0)
  }

  function back() { setStep(s => s - 1); window.scrollTo(0, 0) }

  async function submit() {
    if (!validate(step)) return
    setSubmitting(true)
    setBlocked(null)
    try {
      const r = await api.post(`/applications/${atomId}`, { form_data: values })
      setSubmitted(r.data)
    } catch (e: any) {
      const detail = e.response?.data?.detail
      if (detail && typeof detail === 'object' && detail.message) {
        setBlocked(detail)
      } else {
        alert(typeof detail === 'string' ? detail : 'Ошибка при отправке')
      }
    }
    setSubmitting(false)
  }

  function renderField(field: any) {
    const val = values[field.id] ?? ''
    const err = errors[field.id]
    const isCalc = field.type === 'calculated'
    const isHighlight = field.highlight

    const inputClass = `form-input ${isCalc ? (isHighlight ? 'highlight' : 'calc-field') : ''}`

    const set = (v: any) => setValues(prev => ({ ...prev, [field.id]: v }))

    if (field.type === 'checkbox') {
      return (
        <div key={field.id} className="form-checkbox">
          <input type="checkbox" checked={!!val} onChange={e => set(e.target.checked)} />
          <label style={{ fontSize: 14, cursor: 'pointer' }} onClick={() => set(!val)}>{field.label}</label>
          {err && <span style={{ color: 'var(--red)', fontSize: 12 }}>{err}</span>}
        </div>
      )
    }

    if (field.type === 'select') {
      return (
        <div key={field.id} className="form-group">
          <label className="form-label">{field.label}{field.validation?.required && ' *'}</label>
          <select className={`form-input form-select`} value={val} onChange={e => set(e.target.value)}>
            <option value="">— Выберите —</option>
            {field.options?.map((o: any) => <option key={o} value={o}>{o}</option>)}
          </select>
          {err && <span style={{ color: 'var(--red)', fontSize: 12 }}>{err}</span>}
        </div>
      )
    }

    if (field.type === 'file') {
      return (
        <div key={field.id} className="form-group">
          <label className="form-label">{field.label}{field.validation?.required && ' *'}</label>
          {field.hint && <span className="form-hint">{field.hint}</span>}
          <input type="file" accept={field.accept} className="form-input" style={{ padding: '8px' }}
            onChange={e => set(e.target.files?.[0]?.name || '')} />
          {val && <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ {val}</span>}
          {err && <span style={{ color: 'var(--red)', fontSize: 12 }}>{err}</span>}
        </div>
      )
    }

    // text / number / calculated
    const displayVal = isCalc && field.format === 'currency' && val
      ? fmt(Number(val)) : val

    return (
      <div key={field.id} className="form-group">
        <label className="form-label">
          {field.label}{field.validation?.required && !isCalc && ' *'}
          {isCalc && <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}> (авторасчёт)</span>}
        </label>
        {field.hint && <span className="form-hint">{field.hint}</span>}
        {field.id === 'bin' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input className={inputClass} style={{ flex: 1 }} value={val} maxLength={12} placeholder={field.placeholder}
              onChange={e => set(e.target.value.replace(/\D/g, '').slice(0, 12))} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={prefillEgov} disabled={egovLoading}>
              {egovLoading ? '...' : '📡 eGov'}
            </button>
          </div>
        ) : (
          <input
            className={inputClass}
            type={field.type === 'calculated' ? 'text' : (field.type === 'number' ? 'number' : 'text')}
            value={isCalc ? displayVal : val}
            readOnly={isCalc}
            placeholder={field.placeholder || ''}
            onChange={e => !isCalc && set(field.type === 'number' ? e.target.value : e.target.value)}
          />
        )}
        {err && <span style={{ color: 'var(--red)', fontSize: 12 }}>{err}</span>}
      </div>
    )
  }

  if (loading) return <div className="container page"><p>Загрузка...</p></div>
  if (!atom) return null

  if (blocked) {
    return (
      <div className="container page" style={{ maxWidth: 600, margin: '0 auto' }}>
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 64, marginBottom: 20 }}>🚫</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: '#C0392B' }}>Заявка заблокирована</h2>
          <p style={{ color: 'var(--muted)', marginBottom: 24, fontSize: 14 }}>
            Система верификации обнаружила нарушения
          </p>

          <div className="card" style={{ background: '#FFF5F5', border: '1px solid #FFCDD2', marginBottom: 16, textAlign: 'left' }}>
            <div style={{ fontSize: 12, color: '#C0392B', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Причины отказа</div>
            {blocked.reasons?.map((r: string, i: number) => (
              <div key={i} style={{ fontSize: 14, marginBottom: 4, display: 'flex', gap: 8 }}>
                <span style={{ color: '#C0392B' }}>✗</span> {r}
              </div>
            ))}
          </div>

          <div className="card" style={{ background: '#F8FAFF', marginBottom: 24, textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--muted)' }}>Trust Score</span>
              <span style={{ fontWeight: 700, color: '#C0392B' }}>{(blocked.trust_score * 100).toFixed(0)}%</span>
            </div>
            <hr className="divider" />
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Tol консенсус</div>
            {Object.entries(blocked.tol_sources || {}).map(([k, v]: any) => (
              <div key={k} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ color: 'var(--muted)' }}>{k}</span>
                <span style={{ color: v === true ? 'var(--green)' : v === false ? '#C0392B' : 'var(--muted)', fontWeight: 600 }}>
                  {typeof v === 'boolean' ? (v ? '✓' : '✗') : String(v)}
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => setBlocked(null)}>Исправить заявку</button>
            <button className="btn btn-secondary" onClick={() => nav('/services')}>Все услуги</button>
          </div>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="container page" style={{ maxWidth: 600, margin: '0 auto' }}>
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 64, marginBottom: 20 }}>✅</div>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Заявка подана!</h2>
          <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
            Ваша заявка принята и передана на рассмотрение. Ожидайте уведомления.
          </p>
          <div className="card" style={{ background: '#F8FAFF', marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Номер заявки</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{submitted.app_id?.slice(0, 8).toUpperCase()}</div>
            <hr className="divider" />
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Номер ЕИШ</div>
            <div style={{ fontWeight: 700 }}>{submitted.eis_ref}</div>
          </div>

          <div className="card" style={{ background: '#F0FFF4', border: '1px solid #C6F6D5', marginBottom: 24, textAlign: 'left' }}>
            <div style={{ fontSize: 12, color: '#276749', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>AI верификация</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: 'var(--muted)' }}>Trust Score</span>
              <span style={{ fontWeight: 700, color: '#276749' }}>{submitted.trust_score ? `${(submitted.trust_score * 100).toFixed(0)}%` : '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: 'var(--muted)' }}>Статус</span>
              <span style={{ fontWeight: 700, color: '#276749' }}>VERIFIED ✓</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', wordBreak: 'break-all', marginTop: 4 }}>
              Tamga ID: {submitted.tamga_id}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => nav('/cabinet')}>Перейти в кабинет</button>
            <button className="btn btn-secondary" onClick={() => nav('/services')}>Все услуги</button>
          </div>
        </div>
      </div>
    )
  }

  const currentStep = atom.steps[step]
  const isLast = step === atom.steps.length - 1

  return (
    <div className="container page" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => step === 0 ? nav('/services') : back()}>← Назад</button>
      </div>
      <div className="page-header">
        <div className="page-title">{atom.product_name}</div>
        <div className="page-subtitle">{atom.description}</div>
      </div>

      {/* Steps indicator */}
      <div className="steps">
        {atom.steps.map((s: any, i: number) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < atom.steps.length - 1 ? '1' : undefined }}>
            <div className="step-item">
              <div className={`step-circle ${i < step ? 'done' : i === step ? 'active' : 'inactive'}`}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`step-label ${i < step ? 'done' : i === step ? 'active' : 'inactive'}`}>{s.title}</span>
            </div>
            {i < atom.steps.length - 1 && <div className={`step-line ${i < step ? 'done' : ''}`} />}
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{currentStep.title}</h3>
        {currentStep.description && <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>{currentStep.description}</p>}
        <hr className="divider" />
        <div style={{ marginTop: 20 }}>
          {currentStep.fields.map((f: any) => renderField(f))}
        </div>

        {/* Calc summary on step 2 */}
        {step === 1 && values.monthly_payment > 0 && (
          <div className="calc-result">
            <div className="calc-result-label">Ежемесячный платёж</div>
            <div className="calc-result-main">{fmt(values.monthly_payment)}</div>
            <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
              <div><div style={{ fontSize: 12, color: 'var(--muted)' }}>Сумма финансирования</div><div style={{ fontWeight: 600 }}>{fmt(values.principal || 0)}</div></div>
              <div><div style={{ fontSize: 12, color: 'var(--muted)' }}>Общая сумма</div><div style={{ fontWeight: 600 }}>{fmt(values.total_payment || 0)}</div></div>
              <div><div style={{ fontSize: 12, color: 'var(--muted)' }}>Ставка</div><div style={{ fontWeight: 600 }}>{atom.params.rate_annual_pct}% годовых</div></div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
          <button className="btn btn-secondary" onClick={() => step === 0 ? nav('/services') : back()}>Назад</button>
          {isLast
            ? <button className="btn btn-primary" onClick={submit} disabled={submitting}>{submitting ? 'Отправка...' : 'Подать заявку ✓'}</button>
            : <button className="btn btn-primary" onClick={next}>Далее →</button>
          }
        </div>
      </div>
    </div>
  )
}
