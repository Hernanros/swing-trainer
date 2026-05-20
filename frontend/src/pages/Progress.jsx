import React, { useState, useEffect } from 'react'
import { useUser } from '../context/UserContext'
import { api } from '../api'

const SKILL_LABELS = {
  chart_reading:        'Chart Reading',
  entry_timing:         'Entry Timing',
  risk_sizing:          'Risk & Sizing',
  setup_selection:      'Setup Selection',
  trade_management:     'Trade Management',
  emotional_discipline: 'Emotional Discipline',
}

function StatTile({ label, value, suffix = '', color }) {
  return (
    <div className="stat-tile">
      <div className="stat-tile-label">{label}</div>
      <div className="stat-tile-value" style={color ? { color } : {}}>
        {value != null ? `${value}${suffix}` : '—'}
      </div>
    </div>
  )
}

export default function Progress() {
  const { user } = useUser()
  const [stats, setStats]     = useState(null)
  const [skills, setSkills]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.progress.stats(),
      api.users.skills(user.id),
    ]).then(([s, sk]) => {
      setStats(s)
      setSkills(sk)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [user.id])

  if (loading) return <div className="loading">Loading…</div>

  const winRateColor = stats?.win_rate == null ? null
    : stats.win_rate >= 50 ? 'var(--green)' : 'var(--red)'

  const avgRColor = stats?.avg_r == null ? null
    : stats.avg_r >= 1 ? 'var(--green)' : stats.avg_r >= 0 ? 'var(--yellow)' : 'var(--red)'

  return (
    <div className="page">
      <h2 style={{ color: 'var(--text)', fontWeight: 700 }}>Progress</h2>

      <div className="stat-tiles">
        <StatTile
          label="Win Rate"
          value={stats?.win_rate}
          suffix="%"
          color={winRateColor}
        />
        <StatTile
          label="Avg R"
          value={stats?.avg_r != null ? stats.avg_r.toFixed(2) : null}
          suffix="R"
          color={avgRColor}
        />
        <StatTile
          label="Plan Adherence"
          value={stats?.avg_plan_adherence}
          suffix="%"
        />
        <StatTile
          label="Total P&L"
          value={
            stats?.total_pnl != null
              ? (stats.total_pnl >= 0
                  ? `+$${stats.total_pnl.toFixed(2)}`
                  : `-$${Math.abs(stats.total_pnl).toFixed(2)}`)
              : null
          }
          color={stats?.total_pnl >= 0 ? 'var(--green)' : 'var(--red)'}
        />
      </div>

      <div className="skill-bars">
        <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, marginBottom: 4 }}>
          Skill Scores
        </div>
        {skills.length === 0 && (
          <div style={{ color: 'var(--dim)', fontSize: 13 }}>No skill data yet.</div>
        )}
        {skills.map(s => (
          <div key={s.skill} className="skill-bar-row">
            <div className="skill-bar-header">
              <span className="skill-bar-name">{SKILL_LABELS[s.skill] || s.skill}</span>
              <span className="skill-bar-score">{s.score.toFixed(0)}/100</span>
            </div>
            <div className="skill-bar-track">
              <div className="skill-bar-fill" style={{ width: `${s.score}%` }} />
            </div>
          </div>
        ))}
        <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>
          Skill scores update as you complete drills in Phase 4.
        </div>
      </div>

      {stats && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
          <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, marginBottom: 12 }}>Summary</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, color: 'var(--text2)' }}>
            <div>Total trades logged</div>
            <div style={{ textAlign: 'right', fontFamily: 'monospace' }}>{stats.total_trades}</div>
            <div>Closed trades</div>
            <div style={{ textAlign: 'right', fontFamily: 'monospace' }}>{stats.closed_trades}</div>
            <div>Wins</div>
            <div style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--green)' }}>{stats.wins}</div>
            <div>Losses</div>
            <div style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--red)' }}>{stats.closed_trades - stats.wins}</div>
          </div>
        </div>
      )}
    </div>
  )
}
