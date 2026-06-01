import React, { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'

const PRIMARY = [
  { to: '/',          icon: '🏠', label: 'Home',      exact: true },
  { to: '/train',     icon: '🎯', label: 'Train' },
  { to: '/journal',   icon: '📓', label: 'Journal' },
  { to: '/watchlist', icon: '👁️', label: 'Watchlist' },
]

const MORE = [
  { to: '/progress',   icon: '📈', label: 'Progress' },
  { to: '/tips',       icon: '💡', label: 'Tips' },
  { to: '/playbook',   icon: '📋', label: 'Playbook' },
  { to: '/curriculum', icon: '📚', label: 'Curriculum' },
]

export default function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
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
    setMoreOpen(false)
  }, [location.pathname])

  function goTo(to) {
    setMoreOpen(false)
    navigate(to)
  }

  return (
    <>
      {moreOpen && (
        <div className="bottom-nav-backdrop" onClick={() => setMoreOpen(false)} />
      )}
      {moreOpen && (
        <div className="bottom-nav-more-sheet">
          <div className="bottom-nav-more-handle" />
          {MORE.map(item => (
            <button key={item.to} className="bottom-nav-more-item" onClick={() => goTo(item.to)}>
              <span>{item.icon}</span>
              <span>{item.label}</span>
              {item.to === '/progress' && analysisBadge && (
                <span className="bottom-nav-badge" />
              )}
            </button>
          ))}
        </div>
      )}
      <nav className="bottom-nav">
        {PRIMARY.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
          >
            <span className="bottom-nav-icon">{item.icon}</span>
            <span className="bottom-nav-label">{item.label}</span>
          </NavLink>
        ))}
        <button
          className={`bottom-nav-item${moreOpen ? ' active' : ''}`}
          onClick={() => setMoreOpen(o => !o)}
        >
          <span className="bottom-nav-icon">⋯</span>
          <span className="bottom-nav-label">More</span>
        </button>
      </nav>
    </>
  )
}
