import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useState, useEffect } from 'react'

function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const navItems = [
    { path: '/dashboard', icon: 'bi-speedometer2', label: 'Dashboard' },
    { path: '/transactions', icon: 'bi-list-ul', label: 'Transactions' },
    { path: '/predictions', icon: 'bi-graph-up-arrow', label: 'Predictions' },
    { path: '/fraud', icon: 'bi-shield-exclamation', label: 'Fraud Detection' },
    { path: '/budgets', icon: 'bi-piggy-bank', label: 'Budgets' },
    { path: '/settings', icon: 'bi-gear', label: 'Settings' }
  ]

  const getInitial = () => {
    if (user?.full_name) return user.full_name[0].toUpperCase()
    if (user?.username) return user.username[0].toUpperCase()
    return 'U'
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h4><i className="bi bi-wallet2"></i> OPAM</h4>
        <small className="text-muted">Expense Tracker</small>
      </div>

      <div className="user-info">
        <div className="avatar">{getInitial()}</div>
        <div>
          <strong>{user?.full_name || user?.username}</strong>
          <small className="d-block text-muted">{user?.email}</small>
        </div>
      </div>

      <nav className="nav flex-column">
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <i className={`bi ${item.icon}`}></i> {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="theme-toggle" onClick={toggleTheme}>
          <i className={`bi ${theme === 'dark' ? 'bi-sun-fill' : 'bi-moon-fill'}`}></i>
          <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
        <button
          onClick={handleLogout}
          className="btn btn-outline-light btn-sm w-100 mt-2"
        >
          <i className="bi bi-box-arrow-left"></i> Logout
        </button>
      </div>
    </div>
  )
}

export default Sidebar
