import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../context/UserContext'
import { api } from '../api'
import { DRILL_QUESTIONS } from '../data/drillQuestions'

const SKILL_LABELS = {
  chart_reading:        'Chart Reading',
  entry_timing:         'Entry Timing',
  risk_sizing:          'Risk & Sizing',
  setup_selection:      'Setup Selection',
  trade_management:     'Trade Management',
  emotional_discipline: 'Emotional Discipline',
}

const DRILL_KEY_LABELS = {
  setup_selection:      'Setup Selection',
  entry_timing:         'Entry Timing',
  trade_management:     'Trade Management',
  emotional_discipline: 'Emotional Discipline',
  chart_reading:        'Chart Reading',
  chart_patterns:       'Chart Patterns',
  support_resistance:   'Support & Resistance',
  channels:             'Channels',
}
const DRILL_KEYS = Object.keys(DRILL_KEY_LABELS)

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

function PaperAccountCard({ data, editing, balanceInput, onEditClick, onBalanceChange, onSave, saving }) {
  if (!data) return null
  const pnlColor = data.realized_pnl >= 0 ? 'var(--green)' : 'var(--red)'
  const balColor = data.current_balance >= data.starting_balance ? 'var(--green)' : 'var(--red)'
  const fmt = (n) => {
    const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return n < 0 ? `-$${abs}` : `$${abs}`
  }
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '14px 18px', marginBottom: 20 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.05em', margin: '0 0 10px' }}>
        PAPER ACCOUNT
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 16px', fontSize: 13 }}>
        <span style={{ color: 'var(--muted)' }}>Starting Balance</span>
        <span style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(data.starting_balance)}</span>

        <span style={{ color: 'var(--muted)' }}>Realized P&L</span>
        <span style={{ textAlign: 'right', fontFamily: 'monospace', color: pnlColor }}>
          {data.realized_pnl >= 0 ? '+' : ''}{fmt(data.realized_pnl)}
        </span>

        <span style={{ color: 'var(--text)', fontWeight: 700 }}>Current Balance</span>
        <span style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: balColor }}>
          {fmt(data.current_balance)}
        </span>
      </div>

      <div style={{ borderTop: '1px solid var(--border2)', margin: '10px 0' }} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 16px', fontSize: 13 }}>
        <span style={{ color: 'var(--muted)' }}>
          Capital Deployed{data.open_spread_count > 0 ? ` (${data.open_spread_count} open)` : ''}
        </span>
        <span style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(data.capital_deployed)}</span>

        <span style={{ color: 'var(--muted)' }}>Cash Available</span>
        <span style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(data.cash_available)}</span>

        <span style={{ color: 'var(--muted)' }}>% At Risk</span>
        <span style={{ textAlign: 'right', fontFamily: 'monospace',
          color: data.pct_at_risk > 20 ? 'var(--red)' : data.pct_at_risk > 10 ? 'var(--accent)' : 'var(--text2)' }}>
          {data.pct_at_risk.toFixed(1)}%
        </span>
      </div>

      <div style={{ marginTop: 10 }}>
        {editing ? (
          <form onSubmit={onSave} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="number"
              value={balanceInput}
              onChange={e => onBalanceChange(e.target.value)}
              placeholder="New starting balance"
              min="1"
              step="100"
              style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 5,
                color: 'var(--text)', padding: '4px 8px', fontSize: 12 }}
            />
            <button
              type="submit"
              disabled={saving}
              style={{ background: 'var(--accent)', border: 'none', borderRadius: 5, color: '#111',
                padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => onEditClick(false)}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            onClick={() => { onEditClick(true); onBalanceChange(String(data.starting_balance)) }}
            style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 5,
              color: 'var(--muted)', fontSize: 11, padding: '3px 10px', cursor: 'pointer' }}
          >
            Edit Balance
          </button>
        )}
      </div>
    </div>
  )
}

function BullPerformanceSection() {
  const [open, setOpen]             = useState(false)
  const [kpis, setKpis]             = useState(null)
  const [trades, setTrades]         = useState(null)
  const [loadingData, setLoadingData] = useState(false)

  async function handleToggle() {
    setOpen(o => !o)
    if (!kpis && !loadingData) {
      setLoadingData(true)
      try {
        const [k, t] = await Promise.all([
          api.bull.kpis().catch(() => null),
          api.bull.paperTrades().catch(() => null),
        ])
        setKpis(k)
        setTrades(t)
      } finally {
        setLoadingData(false)
      }
    }
  }

  const bands = kpis?.score_edge
    ? [
        { label: 'Score ≥80', ...kpis.score_edge.high, color: 'var(--green)' },
        { label: 'Score 60–79', ...kpis.score_edge.mid, color: 'var(--accent)' },
        { label: 'Score <60', ...kpis.score_edge.low, color: 'var(--muted)' },
      ]
    : []

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginTop: 16 }}>
      <button
        onClick={handleToggle}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left' }}
      >
        <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14 }}>Bull Performance</span>
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 16 }}>
          {loadingData && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>}

          {kpis && !loadingData && (
            <>
              {kpis.total_trades === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>No resolved paper trades yet. Data appears after first trades expire.</p>
              ) : (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 10 }}>WIN RATE BY SCORE BAND</div>
                    {bands.map(b => (
                      <div key={b.label} style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text2)', marginBottom: 3 }}>
                          <span>{b.label}</span>
                          <span style={{ color: b.color, fontWeight: 700 }}>
                            {Math.round((b.win_rate ?? 0) * 100)}% <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({b.count} trades)</span>
                          </span>
                        </div>
                        <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.round((b.win_rate ?? 0) * 100)}%`, height: '100%', background: b.color, borderRadius: 3 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {trades && !loadingData && trades.total > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 8 }}>PAPER TRADE LOG</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: 'var(--muted)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '4px 8px', fontWeight: 500 }}>Date</th>
                    <th style={{ padding: '4px 8px', fontWeight: 500 }}>Ticker</th>
                    <th style={{ padding: '4px 8px', fontWeight: 500 }}>Spread</th>
                    <th style={{ padding: '4px 8px', fontWeight: 500 }}>Credit</th>
                    <th style={{ padding: '4px 8px', fontWeight: 500 }}>Score</th>
                    <th style={{ padding: '4px 8px', fontWeight: 500 }}>Outcome</th>
                    <th style={{ padding: '4px 8px', fontWeight: 500 }}>P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.trades.map(t => {
                    const outcomeColor = t.outcome === 'win' ? 'var(--green)' : t.outcome === 'loss' ? 'var(--red)' : 'var(--muted)'
                    const pnlColor = t.pnl == null ? 'var(--muted)' : t.pnl >= 0 ? 'var(--green)' : 'var(--red)'
                    return (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 8px', color: 'var(--muted)' }}>
                          {t.logged_at ? t.logged_at.slice(0, 10) : '—'}
                        </td>
                        <td style={{ padding: '6px 8px', color: 'var(--text)', fontWeight: 700 }}>{t.symbol}</td>
                        <td style={{ padding: '6px 8px', color: 'var(--text2)', fontFamily: 'monospace' }}>
                          {t.short_strike && t.long_strike ? `$${t.short_strike}/$${t.long_strike}` : '—'}
                        </td>
                        <td style={{ padding: '6px 8px', color: 'var(--text2)', fontFamily: 'monospace' }}>
                          {t.premium_credit != null ? `$${t.premium_credit.toFixed(2)}` : '—'}
                        </td>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: t.score >= 70 ? 'var(--green)' : t.score >= 50 ? 'var(--accent)' : 'var(--muted)' }}>
                          {t.score ?? '—'}
                        </td>
                        <td style={{ padding: '6px 8px', color: outcomeColor, textTransform: 'capitalize', fontWeight: t.outcome ? 600 : 400 }}>
                          {t.outcome ?? 'open'}
                        </td>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: pnlColor }}>
                          {t.pnl != null ? (t.pnl >= 0 ? `+$${t.pnl.toFixed(0)}` : `-$${Math.abs(t.pnl).toFixed(0)}`) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {trades.total > trades.per_page && (
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                  Showing {trades.trades.length} of {trades.total} trades
                </p>
              )}
            </div>
          )}

          <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 6, fontSize: 12, color: 'var(--muted)' }}>
            🔒 ML Confidence Score — unlocks after 50 resolved paper trades
          </div>
        </div>
      )}
    </div>
  )
}

export default function Progress() {
  const { user } = useUser()
  const [stats, setStats]             = useState(null)
  const [skills, setSkills]           = useState([])
  const [patternData, setPatternData] = useState(null)
  const [setups, setSetups]           = useState([])
  const [analyzing, setAnalyzing]     = useState(false)
  const [analyzeErr, setAnalyzeErr]   = useState(null)
  const [loading, setLoading]         = useState(true)
  const [masteryByKey, setMasteryByKey] = useState({})
  const [paperAccount, setPaperAccount] = useState(null)
  const [editingBalance, setEditingBalance] = useState(false)
  const [balanceInput, setBalanceInput] = useState('')
  const [savingBalance, setSavingBalance] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([
      api.progress.stats(),
      api.users.skills(user.id),
      api.progress.patterns(),
      api.progress.setups(),
      api.train.getAllMastery(),
    ]).then(([s, sk, pd, su, mb]) => {
      setStats(s)
      setSkills(sk)
      setPatternData(pd)
      setSetups(su)
      setMasteryByKey(mb)
    }).catch(err => { console.error('Progress load failed:', err) }).finally(() => setLoading(false))
    api.paperAccount.get().then(setPaperAccount).catch(() => null)
  }, [user.id])

  if (loading) return <div className="loading">Loading…</div>

  const winRateColor = stats?.win_rate == null ? null
    : stats.win_rate >= 50 ? 'var(--green)' : 'var(--red)'

  const avgRColor = stats?.avg_r == null ? null
    : stats.avg_r >= 1 ? 'var(--green)' : stats.avg_r >= 0 ? 'var(--yellow)' : 'var(--red)'

  async function handleSaveBalance(e) {
    e.preventDefault()
    const val = parseFloat(balanceInput)
    if (isNaN(val) || val <= 0) return
    setSavingBalance(true)
    try {
      const updated = await api.paperAccount.setBalance({ starting_balance: val })
      setPaperAccount(updated)
      setEditingBalance(false)
    } catch {
      // silent — user can retry
    } finally {
      setSavingBalance(false)
    }
  }

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

      <PaperAccountCard
        data={paperAccount}
        editing={editingBalance}
        balanceInput={balanceInput}
        onEditClick={(v) => setEditingBalance(v)}
        onBalanceChange={setBalanceInput}
        onSave={handleSaveBalance}
        saving={savingBalance}
      />

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
              <div style={{ flex: 1 }}>
                <span style={{ color: 'var(--text2)', fontSize: 13 }}>{p.pattern_text}</span>
                {p.skill && (
                  <div style={{ marginTop: 4 }}>
                    <button
                      className="btn-sm btn-ghost"
                      style={{ fontSize: 11 }}
                      onClick={() => navigate(`/train?skill=${encodeURIComponent(p.skill)}`)}
                    >
                      Practice {SKILL_LABELS[p.skill] || p.skill.replace(/_/g, ' ')} →
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {patternData?.last_analyzed_at && (
          <div style={{ color: 'var(--dim)', fontSize: 11, marginTop: 8 }}>
            Last analyzed: {new Date(patternData.last_analyzed_at).toLocaleDateString()} · based on {patternData.trade_range}
          </div>
        )}
      </div>

      {setups.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
          <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, marginBottom: 12 }}>By Setup</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: 'var(--muted)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '4px 8px', fontWeight: 500 }}>Setup</th>
                <th style={{ padding: '4px 8px', fontWeight: 500 }}>Trades</th>
                <th style={{ padding: '4px 8px', fontWeight: 500 }}>Win %</th>
                <th style={{ padding: '4px 8px', fontWeight: 500 }}>Avg R</th>
              </tr>
            </thead>
            <tbody>
              {setups.map(s => (
                <tr key={s.setup_type} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{s.setup_type}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--text2)', fontFamily: 'monospace' }}>{s.trades}</td>
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: s.win_rate >= 50 ? 'var(--green)' : 'var(--red)' }}>
                    {s.win_rate}%
                  </td>
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: s.avg_r == null ? 'var(--muted)' : s.avg_r >= 1 ? 'var(--green)' : s.avg_r >= 0 ? 'var(--yellow)' : 'var(--red)' }}>
                    {s.avg_r != null ? `${s.avg_r >= 0 ? '+' : ''}${s.avg_r}R` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
        <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, marginBottom: 14 }}>Question Mastery</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {DRILL_KEYS.map(dk => {
            const total = DRILL_QUESTIONS[dk]?.length || 0
            const records = masteryByKey[dk] || []
            const mastered = records.filter(r => r.state === 'mastered').length
            const learning = records.filter(r => r.state === 'learning').length
            const newCount = total - mastered - learning
            const isComplete = mastered >= total
            return (
              <div key={dk} className="skill-bar-row">
                <div className="skill-bar-header">
                  <span className="skill-bar-name">{DRILL_KEY_LABELS[dk]}</span>
                  <span className="skill-bar-score" style={{ color: isComplete ? 'var(--green)' : 'var(--text2)' }}>
                    {isComplete ? 'Complete ✓' : `${mastered}/${total}`}
                  </span>
                </div>
                <div className="mastery-bar-track">
                  <div style={{ width: `${(mastered / total) * 100}%`, background: 'var(--green)', height: '100%' }} />
                  <div style={{ width: `${(learning / total) * 100}%`, background: 'var(--yellow)', height: '100%' }} />
                </div>
                <div style={{ fontSize: '0.75em', color: 'var(--muted)', marginTop: 3 }}>
                  {mastered} mastered · {learning} learning · {newCount} new
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {stats && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
          <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, marginBottom: 12 }}>Summary</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, color: 'var(--text2)' }}>
            <div>Closed trades (real)</div>
            <div style={{ textAlign: 'right', fontFamily: 'monospace' }}>{stats.closed_trades}</div>
            <div>Wins (real)</div>
            <div style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--green)' }}>{stats.wins}</div>
            <div>Losses (real)</div>
            <div style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--red)' }}>{stats.closed_trades - stats.wins}</div>
          </div>
          {stats.paper?.closed_trades > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8 }}>PAPER TRADING</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, color: 'var(--text2)' }}>
                <div>Closed trades</div>
                <div style={{ textAlign: 'right', fontFamily: 'monospace' }}>{stats.paper.closed_trades}</div>
                <div>Win rate</div>
                <div style={{ textAlign: 'right', fontFamily: 'monospace', color: stats.paper.win_rate >= 50 ? 'var(--green)' : 'var(--red)' }}>
                  {stats.paper.win_rate != null ? `${stats.paper.win_rate}%` : '—'}
                </div>
                <div>Avg R</div>
                <div style={{ textAlign: 'right', fontFamily: 'monospace', color: stats.paper.avg_r >= 1 ? 'var(--green)' : stats.paper.avg_r >= 0 ? 'var(--yellow)' : 'var(--red)' }}>
                  {stats.paper.avg_r != null ? `${stats.paper.avg_r >= 0 ? '+' : ''}${stats.paper.avg_r}R` : '—'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <BullPerformanceSection />
    </div>
  )
}
