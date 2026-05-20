import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

const SKILL_LABELS = {
  setup_selection:     'Setup Selection',
  entry_timing:        'Entry Timing',
  trade_management:    'Trade Management',
  emotional_discipline:'Emotional Discipline',
  chart_reading:       'Chart Reading',
  risk_sizing:         'Risk Sizing',
}

export default function DailyTip() {
  const [tip, setTip] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    api.tips.daily()
      .then(setTip)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="daily-tip-card">
      <span className="muted" style={{ fontSize: 13 }}>Loading today's tip…</span>
    </div>
  )
  if (!tip) return null

  return (
    <div className="daily-tip-card" onClick={() => navigate('/tips')} title="See all tips">
      <div className="daily-tip-header">
        <span className="daily-tip-icon">💡</span>
        <span className="daily-tip-label">
          Daily Tip · {SKILL_LABELS[tip.skill_area] || tip.skill_area}
        </span>
        <span className="daily-tip-link">Library ›</span>
      </div>
      <p className="daily-tip-content">{tip.content}</p>
    </div>
  )
}
