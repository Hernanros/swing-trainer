import React, { useEffect, useState } from 'react'
import { api } from '../api'

const SKILL_LABELS = {
  setup_selection:     'Setup Selection',
  entry_timing:        'Entry Timing',
  trade_management:    'Trade Management',
  emotional_discipline:'Emotional Discipline',
  chart_reading:       'Chart Reading',
  risk_sizing:         'Risk Sizing',
}

export default function Tips() {
  const [library, setLibrary] = useState([])
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [loadingLib, setLoadingLib] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.tips.library().then(setLibrary).finally(() => setLoadingLib(false))
  }, [])

  async function ask(e) {
    e.preventDefault()
    if (!question.trim()) return
    setAsking(true)
    setError('')
    try {
      const tip = await api.tips.ask({ question: question.trim() })
      setLibrary(prev => [tip, ...prev])
      setQuestion('')
    } catch (err) {
      setError(err.message || 'Failed to get answer')
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="greeting">Coach Tips</div>
          <div className="phase-label">Daily coaching · ask anything</div>
        </div>
      </div>

      <div className="ask-card">
        <div className="ask-card-title">Ask the Coach</div>
        <form className="ask-form" onSubmit={ask}>
          <input
            className="ask-input"
            placeholder="e.g. How do I find a clean entry on a breakout?"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            disabled={asking}
          />
          <button className="btn-primary" type="submit" disabled={asking || !question.trim()}>
            {asking ? 'Thinking…' : 'Ask'}
          </button>
        </form>
        {error && <div className="wl-error">{error}</div>}
      </div>

      <div className="tips-library-section">
        <div className="tips-library-title">Library</div>
        {loadingLib ? (
          <div className="muted" style={{ fontSize: 13 }}>Loading…</div>
        ) : library.length === 0 ? (
          <div className="placeholder-card">
            No tips yet — your daily tip will appear here automatically, or ask a question above.
          </div>
        ) : (
          <div className="tips-list">
            {library.map(tip => (
              <div className="tip-card" key={tip.id}>
                <div className="tip-card-meta">
                  {tip.question ? (
                    <span className="tip-tag tip-tag-ask">Q&amp;A</span>
                  ) : (
                    <span className="tip-tag tip-tag-daily">
                      💡 {SKILL_LABELS[tip.skill_area] || tip.skill_area}
                    </span>
                  )}
                  <span className="tip-date">
                    {new Date(tip.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                {tip.question && (
                  <div className="tip-question">"{tip.question}"</div>
                )}
                <p className="tip-content">{tip.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
