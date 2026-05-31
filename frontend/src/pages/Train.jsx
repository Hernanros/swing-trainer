import React, { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useUser } from '../context/UserContext'
import { api } from '../api'
import RiskCalcDrill from '../components/drills/RiskCalcDrill'
import QuizDrill from '../components/drills/QuizDrill'
import { DRILL_META, DRILL_QUESTIONS } from '../data/drillQuestions'

function MasteryBar({ drillKey, masteryByKey }) {
  const total = DRILL_QUESTIONS[drillKey]?.length
  if (!total) return null
  const records = masteryByKey[drillKey] || []
  const mastered = records.filter(r => r.state === 'mastered').length
  const learning = records.filter(r => r.state === 'learning').length
  const masteredPct = (mastered / total) * 100
  const learningPct = (learning / total) * 100
  return (
    <div>
      <div className="mastery-bar-track">
        <div style={{ width: `${masteredPct}%`, background: 'var(--green)', height: '100%' }} />
        <div style={{ width: `${learningPct}%`, background: 'var(--yellow)', height: '100%' }} />
      </div>
      <div style={{ fontSize: '0.72em', color: 'var(--muted)', marginTop: 3 }}>
        {mastered} mastered · {learning} learning · {total - mastered - learning} new
      </div>
    </div>
  )
}

export default function Train() {
  const { user } = useUser()
  const [today, setToday] = useState(null)
  const [activeDrill, setActiveDrill] = useState(null)
  const [loading, setLoading] = useState(true)
  const [masteryByKey, setMasteryByKey] = useState({})

  const loadToday = useCallback(() => {
    api.train.today().then(data => {
      setToday(data)
      setLoading(false)
    })
  }, [])

  useEffect(() => { loadToday() }, [loadToday])
  useEffect(() => {
    api.train.getAllMastery().then(setMasteryByKey).catch(() => {})
  }, [])

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
    api.train.getAllMastery().then(setMasteryByKey).catch(() => {})
  }

  if (loading) return <div className="loading">Loading…</div>

  const pct = today.drills_assigned > 0
    ? Math.min((today.drills_completed / today.drills_assigned) * 100, 100)
    : 0
  const dailyDone = today.remaining === 0

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
        {availableDrills.map(([key, meta]) => {
          const total = DRILL_QUESTIONS[key]?.length
          const mastered = total
            ? (masteryByKey[key] || []).filter(r => r.state === 'mastered').length
            : 0
          const isComplete = total && mastered >= total
          return (
            <div key={key} className="drill-list-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div className="drill-list-title">{meta.label}</div>
                  <div className="drill-list-skill">{meta.skill.replace(/_/g, ' ')}</div>
                </div>
                {isComplete
                  ? <button className="btn-sm" disabled style={{ color: 'var(--green)', borderColor: 'var(--green)', opacity: 1 }}>Complete ✓</button>
                  : <button className="btn-primary" onClick={() => setActiveDrill(key)}>Practice ›</button>
                }
              </div>
              {total && <MasteryBar drillKey={key} masteryByKey={masteryByKey} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
