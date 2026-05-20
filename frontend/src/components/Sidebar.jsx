import React from 'react'
import { NavLink } from 'react-router-dom'
import { useUser } from '../context/UserContext'

const NAV = [
  { to: '/',          icon: '🏠', label: 'Home',      exact: true },
  { to: '/train',     icon: '🎯', label: 'Train' },
  { to: '/journal',   icon: '📓', label: 'Journal' },
  { to: '/playbook',  icon: '📋', label: 'Playbook' },
  { to: '/watchlist', icon: '👁️', label: 'Watchlist' },
  { to: '/progress',  icon: '📈', label: 'Progress' },
  { to: '/tips',       icon: '💡', label: 'Tips' },
  { to: '/curriculum', icon: '📚', label: 'Curriculum' },
]

export default function Sidebar() {
  const { user, users, switchUser } = useUser()

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
        </NavLink>
      ))}

      <div className="sidebar-spacer" />

      {users.length > 1 && (
        <div className="user-switcher">
          <select
            value={user?.id ?? ''}
            onChange={e => {
              const found = users.find(u => u.id === parseInt(e.target.value, 10))
              if (found) switchUser(found)
            }}
          >
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      )}
    </nav>
  )
}
