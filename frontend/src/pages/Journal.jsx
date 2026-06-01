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

export default function Journal() {
  const [trades, setTrades]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [drawer, setDrawer]   = useState(null) // null | { mode:'open' } | { mode:'close', trade }
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
                    <td style={{ padding: '9px 10px', fontWeight: 600, color: 'var(--text)' }}>{t.symbol}</td>
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
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      {t.status === 'open' && (
                        <button
                          onClick={() => setDrawer({ mode: 'close', trade: t })}
                          style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 5, color: 'var(--muted)', fontSize: 11, padding: '3px 10px', cursor: 'pointer' }}
                        >
                          Close
                        </button>
                      )}
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
          onSubmit={drawer.mode === 'open' ? handleOpen : handleClose}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  )
}
