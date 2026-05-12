import { Link, useNavigate } from 'react-router-dom'

export default function Navbar() {
  const navigate = useNavigate()
  const name = localStorage.getItem('name')
  const isAdmin = localStorage.getItem('is_admin') === 'true'

  function logout() {
    localStorage.clear()
    navigate('/')
  }

  return (
    <>
      {isAdmin && <div className="admin-bar">⚙️ Режим администратора — у вас доступ к конструктору форм</div>}
      <nav className="navbar">
        <Link to="/" className="navbar-brand">БАЙТЕРЕК <span>·</span> Портал</Link>
        <div className="navbar-links">
          <Link to="/services">Услуги</Link>
          {name ? (
            <>
              <Link to="/cabinet">Кабинет</Link>
              {isAdmin && <Link to="/admin">Конструктор</Link>}
              <button onClick={logout}>{name} · Выход</button>
            </>
          ) : (
            <>
              <Link to="/login">Войти</Link>
              <Link to="/register" className="btn-gold" style={{padding:'6px 14px',borderRadius:6,fontWeight:600}}>Регистрация</Link>
            </>
          )}
        </div>
      </nav>
    </>
  )
}
