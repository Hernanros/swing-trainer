import React, { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useUser } from '../context/UserContext'
import { api } from '../api'
import RiskCalcDrill from '../components/drills/RiskCalcDrill'
import QuizDrill from '../components/drills/QuizDrill'
import { DRILL_META } from '../data/drillQuestions'

export default function Train() {
  const { user } = useUser()
  const [today, setToday] = useState(null)
  const [activeDrill, setActiveDrill] = useState(null)  // key from DRILL_META
  const [loading, setLoading] = useState(true)

  const loadToday = useCallback(() => {
    api.train.today().then(data => {
      setToday(data)
      setLoading(false)
    })
  }, [])

  useEffect(() => { loadToday() }, [loadToday])

  const [searchParams] = useSearchParams()

  useEffect(() => {
    if (loading) return
    const skillParam = searchParams.get('skill')
    if (!skillParam) return
    const matches = Object.entries(DRILL_META).filter(([, meta]) => meta.skill === skillParam)
    if (matches.length === 0) return
    const [key] = matches[Math.floor(Math.random() * matches.length)]
    setActiveDrill(key)
  }, [loading, searchParams])

  function drillComplete() {
    setActiveDrill(null)
    loadToday()
  }

  if (loading) return <div className="loading">Loading…</div>

  const pct = today.drills_assigned > 0
    ? Math.min((today.drills_completed / today.drills_assigned) * 100, 100)
    : 0
  const dailyDone = today.remaining === 0

  // Show drills for active skills; always include risk_sizing
  const availableDrills = Object.entries(DRILL_META).filter(([key]) =>
    user.active_skills.includes(DRILL_META[key].skill)
  )

  if (activeDrill) {
    const meta = DRILL_META[activeDrill]
    return (
      <div className="page">
        <button
          className="btn-sm btn-ghost"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => setActiveDrill(null)}
        >
          ← Back to drills
        </button>
        {activeDrill === 'risk_sizing'
          ? <RiskCalcDrill onComplete={drillComplete} />
          : <QuizDrill skill={meta.skill} drillKey={activeDrill} drillType={meta.type} onComplete={drillComplete} />
        }
      </div>
    )
  }

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="greeting">Train</div>
          <div className="phase-label">
            {today.drills_completed} / {today.drills_assigned} daily drills done
            {dailyDone && ' ✓'}
          </div>
        </div>
      </div>

      <div className="drill-progress">
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85em', color: 'var(--text2)' }}>
          <span>Today's quota</span>
          <span style={{ color: dailyDone ? 'var(--green)' : 'var(--text2)' }}>
            {today.drills_completed}/{today.drills_assigned}
          </span>
        </div>
        <div className="drill-progress-bar-track">
          <div
            className="drill-progress-bar-fill"
            style={{ width: `${pct}%`, background: dailyDone ? 'var(--green)' : undefined }}
          />
        </div>
      </div>

      <div style={{ fontSize: '0.8em', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
        Available Drills — {availableDrills.length} for your active skills
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {availableDrills.map(([key, meta]) => (
          <div key={key} className="drill-list-row">
            <div>
              <div className="drill-list-title">{meta.label}</div>
              <div className="drill-list-skill">{meta.skill.replace(/_/g, ' ')}</div>
            </div>
            <button className="btn-primary" onClick={() => setActiveDrill(key)}>
              Practice ›
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
