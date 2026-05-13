import React, { useState, useEffect } from 'react'
import { useUser } from '../context/UserContext'
import { api } from '../api'

const PHASE_LABEL = {
  'pre-market':  'Pre-market',
  'market':      'Market Hours',
  'post-market': 'Post-market',
}

function getPhase(now) {
  const h = now.getHours(), m = now.getMinutes()
  if (h < 9 || (h === 9 && m < 30)) return 'pre-market'
  if (h < 16) return 'market'
  return 'post-market'
}

function getWeekBounds() {
  const now = new Date()
  const day = now.getDay()                  // 0=Sun
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { monday, sunday }
}

export default function Home() {
  const { user } = useUser()
  const now      = new Date()
  const h        = now.getHours()
  const greeting = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
  const phase    = getPhase(now)
  const level    = 1

  const [trades, setTrades] = useState([])

  useEffect(() => {
    api.trades.list().then(setTrades).catch(() => {})
  }, [])

  const openTrades = trades.filter(t => t.status === 'open')

  const { monday, sunday } = getWeekBounds()
  const weekClosed = trades.filter(t => {
    if (t.status !== 'closed') return false
    const d = new Date(t.created_at)
    return d >= monday && d <= sunday
  })
  const weekWins  = weekClosed.filter(t => t.pnl >= 0).length
  const weekTotal = weekClosed.length
  const weekPnl   = weekClosed.reduce((sum, t) => sum + (t.pnl || 0), 0)
  const winRate   = weekTotal > 0 ? Math.round((weekWins / weekTotal) * 100) : null

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="greeting">Good {greeting}, {user.name}</div>
          <div className="phase-label">{PHASE_LABEL[phase]}</div>
        </div>
        <div className="level-badge">Level {level} · Beginner</div>
      </div>

      <div className="placeholder-card">
        <strong>Today's Training Session</strong>
        <p style={{ marginTop: 8 }}>Drills coming in Phase 3.</p>
      </div>

      <div className="grid-2">
        <div className="placeholder-card">
          <strong>Skill Progress</strong>
          <p style={{ marginTop: 8 }}>Charts coming in Phase 3.</p>
        </div>

        {/* Open Positions */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 12, fontSize: 14 }}>Open Positions</div>
          {openTrades.length === 0 ? (
            <div style={{ color: 'var(--dim)', fontSize: 13 }}>No open positions.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {openTrades.map(t => (
                <div key={t.id} style={{ borderLeft: `3px solid ${t.direction === 'long' ? 'var(--green)' : 'var(--red)'}`, paddingLeft: 10 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>
                    {t.symbol}{' '}
                    <span style={{ fontWeight: 400, color: t.direction === 'long' ? 'var(--green)' : 'var(--red)', fontSize: 11, textTransform: 'uppercase' }}>
                      {t.direction}
                    </span>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}>
                    Entry ${t.entry_price.toFixed(2)} · {t.shares} shares · Stop ${t.stop_price.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="placeholder-card">
          <strong>Training Streak</strong>
          <p style={{ marginTop: 8 }}>Coming in Phase 3.</p>
        </div>

        {/* This Week's Edge */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 12, fontSize: 14 }}>This Week's Edge</div>
          {weekTotal === 0 ? (
            <div style={{ color: 'var(--dim)', fontSize: 13 }}>No closed trades this week.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>Win Rate</span>
                  <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 13 }}>{winRate}%</span>
                </div>
                <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${winRate}%`, background: 'var(--green)', borderRadius: 3, transition: 'width 0.4s' }} />
                </div>
                <div style={{ color: 'var(--dim)', fontSize: 11, marginTop: 4 }}>
                  {weekWins}W · {weekTotal - weekWins}L this week
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>Total P&L</span>
                <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 14, color: weekPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {weekPnl >= 0 ? '+' : ''}${weekPnl.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
