import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api'

export function Login() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const r = await api.post('/auth/login', form)
      localStorage.setItem('token', r.data.token)
      localStorage.setItem('name', r.data.name)
      localStorage.setItem('is_admin', String(r.data.is_admin))
      nav(r.data.is_admin ? '/admin' : '/cabinet')
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Ошибка входа')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 400, padding: 40 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>Вход в систему</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, textAlign: 'center', marginBottom: 28 }}>Портал поддержки бизнеса «Байтерек»</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="you@company.kz" required />
          </div>
          <div className="form-group">
            <label className="form-label">Пароль</label>
            <input className="form-input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
          </div>
          <button className="btn btn-primary btn-block" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'var(--muted)' }}>
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </p>
        <div className="alert alert-info" style={{ marginTop: 20, fontSize: 12 }}>
          <strong>Demo-admin:</strong> admin@baiterek.kz / admin123
        </div>
      </div>
    </div>
  )
}

export function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const r = await api.post('/auth/register', form)
      localStorage.setItem('token', r.data.token)
      localStorage.setItem('name', r.data.name)
      localStorage.setItem('is_admin', String(r.data.is_admin))
      nav('/cabinet')
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Ошибка регистрации')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 420, padding: 40 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>Регистрация</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, textAlign: 'center', marginBottom: 28 }}>Создайте аккаунт для подачи заявок</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">ФИО</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Иванов Иван Иванович" required />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="you@company.kz" required />
          </div>
          <div className="form-group">
            <label className="form-label">Пароль</label>
            <input className="form-input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} minLength={6} required />
          </div>
          <button className="btn btn-primary btn-block" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'var(--muted)' }}>
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      </div>
    </div>
  )
}
