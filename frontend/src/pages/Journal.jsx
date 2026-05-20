import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import TradeDrawer from '../components/TradeDrawer'

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
    await api.trades.close(drawer.trade.id, body)
    await loadTrades()
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
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
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
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }}>
                    <td style={{ padding: '9px 10px', color: 'var(--muted)' }}>
                      {new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
          onSubmit={drawer.mode === 'open' ? handleOpen : handleClose}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  )
}
