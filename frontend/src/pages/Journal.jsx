import React, { useState, useEffect, useCallback, Fragment } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import TradeDrawer from '../components/TradeDrawer'
import TradeChart from '../components/TradeChart'

function statusBadge(trade) {
  if (trade.status === 'open') return { label: 'OPEN', color: 'var(--yellow)' }
  return trade.pnl >= 0
    ? { label: 'WIN',  color: 'var(--green)' }
    : { label: 'LOSS', color: 'var(--red)' }
}

function fmt(n, decimals = 2) {
  if (n == null) return '—'
  return n.toFixed(decimals)
}

function fmtPnl(n) {
  if (n == null) return '—'
  return `${n >= 0 ? '+' : ''}$${n.toFixed(2)}`
}

const SPREAD_LABELS = {
  bull_call: 'Bull Call',
  bear_put:  'Bear Put',
  bull_put:  'Bull Put',
  bear_call: 'Bear Call',
}

function fmtExpiry(str) {
  if (!str) return ''
  const d = new Date(str + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function Journal() {
  const [trades, setTrades]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [drawer, setDrawer]   = useState(null) // null | { mode:'open' } | { mode:'close', trade } | { mode:'edit', trade }
  const [deletingId, setDeletingId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (location.state?.prefill) {
      setDrawer({ mode: 'open', prefill: location.state.prefill })
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [])

  const loadTrades = useCallback(async () => {
    try {
      const data = await api.trades.list()
      setTrades(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadTrades() }, [loadTrades])

  async function handleOpen(body) {
    await api.trades.open(body)
    await loadTrades()
  }

  async function handleClose(body) {
    const result = await api.trades.close(drawer.trade.id, body)
    await loadTrades()
    const count = result?.closed_count
    if (count && count >= 5 && count % 5 === 0) {
      sessionStorage.setItem('analysis_available', '1')
      window.dispatchEvent(new Event('analysis-badge'))
    }
  }

  async function handleEdit(body) {
    await api.trades.update(drawer.trade.id, body)
    await loadTrades()
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this trade? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await api.trades.delete(id)
      await loadTrades()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ color: 'var(--text)', fontWeight: 700 }}>Trade Journal</h2>
        <button
          onClick={() => setDrawer({ mode: 'open' })}
          style={{ background: '#238636', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          + New Trade
        </button>
      </div>

      {loading && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>}
      {error   && <div style={{ color: 'var(--red)',   fontSize: 13 }}>Error: {error}</div>}

      {!loading && !error && trades.length === 0 && (
        <div className="placeholder-card">
          No trades yet. Click + New Trade to log your first.
        </div>
      )}

      {!loading && trades.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="journal-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', textAlign: 'left' }}>
                {['Date','Symbol','Dir','Entry','Exit','P&L','R','Status',''].map(h => (
                  <th key={h} style={{ padding: '8px 10px', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trades.map(t => {
                const badge = statusBadge(t)
                return (
                  <Fragment key={t.id}>
                  <tr
                    onClick={t.status === 'closed' ? () => setExpandedId(expandedId === t.id ? null : t.id) : undefined}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      verticalAlign: 'middle',
                      cursor: t.status === 'closed' ? 'pointer' : 'default',
                    }}
                  >
                    <td style={{ padding: '9px 10px', color: 'var(--muted)' }}>
                      {new Date(t.trade_date || t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                    <td style={{ padding: '9px 10px', fontWeight: 600, color: 'var(--text)' }}>
                      {t.symbol}
                      {t.trade_type === 'option_spread' && t.option_spread_type && (
                        <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 500, marginTop: 2 }}>
                          {SPREAD_LABELS[t.option_spread_type]}
                          {t.option_long_strike && t.option_short_strike && (
                            <span style={{ color: 'var(--muted)', marginLeft: 4 }}>
                              {t.option_long_strike}/{t.option_short_strike} · {fmtExpiry(t.option_expiry)}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '9px 10px', color: t.direction === 'long' ? 'var(--green)' : 'var(--red)', textTransform: 'uppercase', fontSize: 11, fontWeight: 600 }}>
                      {t.direction}
                    </td>
                    <td style={{ padding: '9px 10px', color: 'var(--text2)', fontFamily: 'monospace' }}>${fmt(t.entry_price)}</td>
                    <td style={{ padding: '9px 10px', color: 'var(--text2)', fontFamily: 'monospace' }}>
                      {t.exit_price != null ? `$${fmt(t.exit_price)}` : '—'}
                    </td>
                    <td style={{ padding: '9px 10px', fontFamily: 'monospace', color: t.pnl == null ? 'var(--muted)' : t.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {fmtPnl(t.pnl)}
                    </td>
                    <td style={{ padding: '9px 10px', fontFamily: 'monospace', color: 'var(--text2)' }}>
                      {t.r_multiple != null ? `${t.r_multiple >= 0 ? '+' : ''}${fmt(t.r_multiple, 2)}R` : '—'}
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <span style={{ border: `1px solid ${badge.color}`, borderRadius: 4, padding: '2px 7px', fontSize: 10, fontWeight: 700, color: badge.color, letterSpacing: '0.05em' }}>
                        {badge.label}
                      </span>
                      {t.practice && (
                        <span style={{ marginLeft: 5, border: '1px solid var(--muted)', borderRadius: 4, padding: '2px 5px', fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.05em' }}>
                          PAPER
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                        {t.status === 'open' && (
                          <>
                            <button
                              onClick={e => { e.stopPropagation(); setDrawer({ mode: 'close', trade: t }) }}
                              style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 5, color: 'var(--muted)', fontSize: 11, padding: '3px 8px', cursor: 'pointer' }}
                            >
                              Close
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); setDrawer({ mode: 'edit', trade: t }) }}
                              style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 5, color: 'var(--accent)', fontSize: 11, padding: '3px 8px', cursor: 'pointer' }}
                            >
                              Edit
                            </button>
                          </>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(t.id) }}
                          disabled={deletingId === t.id}
                          style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 13, padding: '2px 4px', cursor: 'pointer', opacity: deletingId === t.id ? 0.4 : 1 }}
                          title="Delete trade"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                  {t.status === 'closed' && expandedId === t.id && (
                    <tr key={`${t.id}-detail`}>
                      <td
                        colSpan={9}
                        style={{ padding: '0 10px 16px', background: 'var(--surface)' }}
                      >
                        <TradeChart
                          symbol={t.symbol}
                          date={t.trade_date || t.created_at.split('T')[0]}
                          entry={t.entry_price}
                          stop={t.stop_price}
                          target={t.target_price}
                          exit={t.exit_price}
                        />
                        {t.ai_debrief && (
                          <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 8 }}>
                            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>AI Debrief: </span>
                            {t.ai_debrief}
                          </div>
                        )}
                        {t.checklist_score != null && (
                          <div style={{
                            fontSize: 12,
                            marginTop: 6,
                            color: t.checklist_score >= 80
                              ? 'var(--green)'
                              : t.checklist_score >= 50
                                ? 'var(--yellow)'
                                : 'var(--red)',
                          }}>
                            Checklist: {t.checklist_score.toFixed(0)}%
                          </div>
                        )}
                        {t.trade_type === 'option_spread' && t.option_spread_type && (
                          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                            <span><span style={{ color: 'var(--muted)' }}>Spread: </span>{SPREAD_LABELS[t.option_spread_type]}</span>
                            <span><span style={{ color: 'var(--muted)' }}>Strikes: </span>{t.option_long_strike} / {t.option_short_strike}</span>
                            <span><span style={{ color: 'var(--muted)' }}>Expiry: </span>{fmtExpiry(t.option_expiry)}</span>
                            {t.max_loss    != null && <span><span style={{ color: 'var(--muted)' }}>Max Risk: </span><span style={{ color: 'var(--red)', fontFamily: 'monospace' }}>${fmt(t.max_loss)}</span></span>}
                            {t.max_profit  != null && <span><span style={{ color: 'var(--muted)' }}>Max Profit: </span><span style={{ color: 'var(--green)', fontFamily: 'monospace' }}>${fmt(t.max_profit)}</span></span>}
                            {t.breakeven   != null && <span><span style={{ color: 'var(--muted)' }}>Breakeven: </span><span style={{ fontFamily: 'monospace' }}>{t.breakeven}</span></span>}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {drawer && (
        <TradeDrawer
          mode={drawer.mode}
          trade={drawer.trade}
          prefill={drawer.prefill}
          onSubmit={drawer.mode === 'open' ? handleOpen : drawer.mode === 'edit' ? handleEdit : handleClose}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  )
}
