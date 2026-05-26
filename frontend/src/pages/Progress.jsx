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
  const [stats, setStats]             = useState(null)
  const [skills, setSkills]           = useState([])
  const [patternData, setPatternData] = useState(null)
  const [analyzing, setAnalyzing]     = useState(false)
  const [analyzeErr, setAnalyzeErr]   = useState(null)
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    Promise.all([
      api.progress.stats(),
      api.users.skills(user.id),
      api.progress.patterns(),
    ]).then(([s, sk, pd]) => {
      setStats(s)
      setSkills(sk)
      setPatternData(pd)
    }).catch(err => { console.error('Progress load failed:', err) }).finally(() => setLoading(false))
  }, [user.id])

  if (loading) return <div className="loading">Loading…</div>

  const winRateColor = stats?.win_rate == null ? null
    : stats.win_rate >= 50 ? 'var(--green)' : 'var(--red)'

  const avgRColor = stats?.avg_r == null ? null
    : stats.avg_r >= 1 ? 'var(--green)' : stats.avg_r >= 0 ? 'var(--yellow)' : 'var(--red)'

  function handleAnalyze() {
    setAnalyzing(true)
    setAnalyzeErr(null)
    api.progress.analyze()
      .then(() => api.progress.patterns().then(setPatternData))
      .catch(() => setAnalyzeErr('Analysis failed — try again'))
      .finally(() => setAnalyzing(false))
  }

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

      {/* AI Pattern Analysis */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14 }}>AI Pattern Analysis</div>
          {patternData?.min_trades_met && (
            <button
              className="btn-primary"
              style={{ fontSize: 12, padding: '4px 12px' }}
              disabled={!patternData.can_analyze || analyzing}
              title={!patternData.can_analyze ? 'Add a new trade first' : ''}
              onClick={handleAnalyze}
            >
              {analyzing ? 'Analyzing…' : 'Analyze my trading'}
            </button>
          )}
        </div>

        {analyzeErr && (
          <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{analyzeErr}</div>
        )}

        {!patternData?.patterns?.length && !analyzing && (
          <div style={{ color: 'var(--dim)', fontSize: 13 }}>
            {patternData?.min_trades_met
              ? 'No analysis yet — click "Analyze my trading" to get started.'
              : 'Log at least 5 closed trades to unlock pattern analysis.'}
          </div>
        )}

        {(patternData?.patterns ?? []).map((p, i) => {
          const color = p.severity === 'problem' ? 'var(--red)'
            : p.severity === 'watch' ? 'var(--yellow)'
            : 'var(--green)'
          return (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
              <span style={{
                background: color,
                color: '#000',
                borderRadius: 4,
                padding: '2px 6px',
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                marginTop: 2,
              }}>
                {p.severity}
              </span>
              <span style={{ color: 'var(--text2)', fontSize: 13 }}>{p.pattern_text}</span>
            </div>
          )
        })}

        {patternData?.last_analyzed_at && (
          <div style={{ color: 'var(--dim)', fontSize: 11, marginTop: 8 }}>
            Last analyzed: {new Date(patternData.last_analyzed_at).toLocaleDateString()} · based on {patternData.trade_range}
          </div>
        )}
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
