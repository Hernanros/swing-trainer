import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../context/UserContext'
import { api } from '../api'
import DailyTip from '../components/DailyTip'

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
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { monday, sunday }
}

function levelFromScore(avg) {
  if (avg >= 80) return 'Expert'
  if (avg >= 60) return 'Advanced'
  if (avg >= 40) return 'Intermediate'
  if (avg >= 20) return 'Developing'
  return 'Beginner'
}

const SKILL_LABEL = {
  chart_reading:       'Chart Reading',
  entry_timing:        'Entry Timing',
  risk_sizing:         'Risk Sizing',
  setup_selection:     'Setup Selection',
  trade_management:    'Trade Management',
  emotional_discipline:'Emotional Discipline',
}

export default function Home() {
  const { user } = useUser()
  const navigate = useNavigate()
  const now      = new Date()
  const h        = now.getHours()
  const greeting = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
  const phase    = getPhase(now)

  const [trades, setTrades]     = useState([])
  const [skills, setSkills]     = useState([])
  const [today, setToday]       = useState(null)
  const [patterns, setPatterns] = useState([])

  useEffect(() => {
    api.trades.list().then(setTrades).catch(() => {})
    api.users.skills(user.id).then(setSkills).catch(() => {})
    api.train.today().then(setToday).catch(() => {})
    api.progress.patterns()
      .then(pd => setPatterns(pd.patterns || []))
      .catch(err => console.error('Failed to load patterns:', err))
  }, [user.id])

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

  const avgSkill = skills.length > 0
    ? skills.reduce((s, sk) => s + sk.score, 0) / skills.length
    : 0
  const levelLabel = levelFromScore(avgSkill)

  const activeSkillScores = skills.filter(sk => user.active_skills.includes(sk.skill))

  const weakestSkill = activeSkillScores.length > 0
    ? activeSkillScores.reduce((a, b) => a.score <= b.score ? a : b)
    : null

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="greeting">Good {greeting}, {user.name}</div>
          <div className="phase-label">{PHASE_LABEL[phase]}</div>
        </div>
        <div className="level-badge">{levelLabel} · {Math.round(avgSkill)} avg</div>
      </div>

      <DailyTip />

      {/* Coaching Insight */}
      {(() => {
        const top = patterns.find(p => p.severity === 'problem') || patterns.find(p => p.severity === 'watch')
        if (!top) return null
        const color = top.severity === 'problem' ? 'var(--red)' : 'var(--yellow)'
        return (
          <div style={{ background: 'var(--surface)', border: `1px solid ${color}`, borderRadius: 10, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{
                background: color, color: '#000', borderRadius: 4,
                padding: '2px 6px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              }}>
                {top.severity}
              </span>
              <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>Coaching Insight</span>
            </div>
            <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 8 }}>{top.pattern_text || ''}</div>
            <div
              style={{ color: 'var(--accent)', fontSize: 12, cursor: 'pointer' }}
              onClick={() => navigate('/progress')}
            >
              See full analysis →
            </div>
          </div>
        )
      })()}

      {/* Training Session Card */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
        <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 8, fontSize: 14 }}>Today's Training Session</div>
        {today ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>
                {today.drills_completed} of {today.drills_assigned} drills completed
              </div>
              <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${today.drills_assigned > 0 ? (today.drills_completed / today.drills_assigned) * 100 : 0}%`,
                  background: today.remaining === 0 ? 'var(--green)' : 'var(--accent)',
                  borderRadius: 3,
                  transition: 'width 0.5s',
                }} />
              </div>
            </div>
            {today.remaining > 0 ? (
              <button className="btn-primary" onClick={() => navigate('/train')}>
                {today.drills_completed === 0 ? 'Start Session ›' : 'Continue ›'}
              </button>
            ) : (
              <span style={{ color: 'var(--green)', fontWeight: 600, fontSize: 13 }}>✓ Done</span>
            )}
          </div>
        ) : (
          <div style={{ color: 'var(--dim)', fontSize: 13 }}>Loading…</div>
        )}
      </div>

      <div className="grid-2">
        {/* Skill Bars */}
        <div className="skill-bars">
          <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, marginBottom: 4 }}>Skill Progress</div>
          {activeSkillScores.length === 0 ? (
            <div style={{ color: 'var(--dim)', fontSize: 13 }}>Complete drills to build skill scores.</div>
          ) : (
            activeSkillScores.map(sk => (
              <div className="skill-bar-row" key={sk.skill}>
                <div className="skill-bar-header">
                  <span className="skill-bar-name">{SKILL_LABEL[sk.skill] || sk.skill}</span>
                  <span className="skill-bar-score">{sk.score.toFixed(0)}</span>
                </div>
                <div className="skill-bar-track">
                  <div className="skill-bar-fill" style={{ width: `${sk.score}%` }} />
                </div>
              </div>
            ))
          )}
          {weakestSkill && (
            <button
              className="btn-sm btn-ghost"
              style={{ marginTop: 8, alignSelf: 'flex-start' }}
              onClick={() => navigate(`/train?skill=${weakestSkill.skill}`)}
            >
              Practice {SKILL_LABEL[weakestSkill.skill] || weakestSkill.skill} →
            </button>
          )}
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

      {/* This Week's Edge */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
        <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 12, fontSize: 14 }}>This Week's Edge</div>
        {weekTotal === 0 ? (
          <div style={{ color: 'var(--dim)', fontSize: 13 }}>No closed trades this week.</div>
        ) : (
          <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
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
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>Total P&L</div>
              <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 16, color: weekPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {weekPnl >= 0 ? '+' : ''}${weekPnl.toFixed(2)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
