import React, { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useUser } from '../context/UserContext'

const NAV = [
  { to: '/',          icon: '🏠', label: 'Home',      exact: true },
  { to: '/train',     icon: '🎯', label: 'Train' },
  { to: '/journal',   icon: '📓', label: 'Journal' },
  { to: '/playbook',  icon: '📋', label: 'Playbook' },
  { to: '/watchlist', icon: '👁️', label: 'Watchlist' },
  { to: '/progress',  icon: '📈', label: 'Progress' },
  { to: '/bull',      icon: '🐂', label: 'Bull' },
  { to: '/tips',       icon: '💡', label: 'Tips' },
  { to: '/curriculum', icon: '📚', label: 'Curriculum' },
]

export default function Sidebar() {
  const { user, status } = useUser()
  const location = useLocation()
  const [analysisBadge, setAnalysisBadge] = useState(
    () => sessionStorage.getItem('analysis_available') === '1'
  )

  useEffect(() => {
    function onBadge() { setAnalysisBadge(true) }
    window.addEventListener('analysis-badge', onBadge)
    return () => window.removeEventListener('analysis-badge', onBadge)
  }, [])

  useEffect(() => {
    if (location.pathname === '/progress') {
      sessionStorage.removeItem('analysis_available')
      setAnalysisBadge(false)
    }
  }, [location.pathname])

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        SwingTrainer
        <span>v2.0</span>
      </div>

      {NAV.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.exact}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <span className="nav-icon">{item.icon}</span>
          {item.label}
          {item.to === '/progress' && analysisBadge && (
            <span style={{
              display: 'inline-block', width: 7, height: 7,
              borderRadius: '50%', background: 'var(--red)',
              marginLeft: 6, verticalAlign: 'middle',
            }} />
          )}
        </NavLink>
      ))}

      <div className="sidebar-spacer" />

      {status === "admin" && (
        <NavLink
          to="/admin"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <span className="nav-icon">🛡️</span>
          Admin
        </NavLink>
      )}
      <NavLink to="/account" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
        <span className="nav-icon">⚙️</span>
        Account
      </NavLink>
    </nav>
  )
}
