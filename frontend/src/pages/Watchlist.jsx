import React, { useEffect, useState, useCallback } from 'react'
import { api } from '../api'
import ChartModal from '../components/ChartModal'

function QuoteCell({ symbol }) {
  const [quote, setQuote] = useState(null)
  const [err, setErr] = useState(false)
  const [loading, setLoading] = useState(true)

  function load() {
    setErr(false)
    setLoading(true)
    api.market.quote(symbol)
      .then(q => { setQuote(q); setLoading(false) })
      .catch(() => { setErr(true); setLoading(false) })
  }

  useEffect(() => { load() }, [symbol])

  if (loading) return <span className="wl-price muted">…</span>
  if (err) return (
    <span className="wl-price muted" style={{ cursor: 'pointer' }} onClick={load} title="Retry">
      unavailable ↺
    </span>
  )

  const up = quote.change_pct >= 0
  return (
    <span className={`wl-price ${up ? 'green' : 'red'}`}>
      ${quote.price.toFixed(2)}{' '}
      <span className="wl-change">
        {up ? '+' : ''}{quote.change_pct.toFixed(2)}%
      </span>
    </span>
  )
}

export default function Watchlist() {
  const [items, setItems] = useState([])
  const [symbol, setSymbol] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [editId, setEditId] = useState(null)
  const [editNotes, setEditNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [chartSymbol, setChartSymbol] = useState(null)

  const load = useCallback(() => {
    api.watchlist.list().then(setItems).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function add(e) {
    e.preventDefault()
    if (!symbol.trim()) return
    setError('')
    try {
      await api.watchlist.add({ symbol: symbol.trim(), notes })
      setSymbol('')
      setNotes('')
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(id) {
    await api.watchlist.remove(id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  async function saveNotes(id) {
    const updated = await api.watchlist.updateNotes(id, { notes: editNotes })
    setItems(prev => prev.map(i => i.id === id ? { ...i, notes: updated.notes } : i))
    setEditId(null)
  }

  if (loading) return <div className="loading">Loading…</div>

  return (
    <div className="page">
      {chartSymbol && <ChartModal symbol={chartSymbol} onClose={() => setChartSymbol(null)} />}
      <div className="topbar">
        <div>
          <div className="greeting">Watchlist</div>
          <div className="phase-label">Track your setups</div>
        </div>
      </div>

      <form className="wl-add-form" onSubmit={add}>
        <input
          className="wl-input"
          placeholder="Symbol (e.g. NVDA)"
          value={symbol}
          onChange={e => setSymbol(e.target.value.toUpperCase())}
        />
        <input
          className="wl-input wl-input-notes"
          placeholder="Notes (optional)"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
        <button className="btn-primary" type="submit">Add</button>
      </form>
      {error && <div className="wl-error">{error}</div>}

      {items.length === 0 ? (
        <div className="placeholder-card">No symbols yet — add one above.</div>
      ) : (
        <div className="wl-table">
          <div className="wl-header">
            <span>Symbol</span>
            <span>Price / Change</span>
            <span>Notes</span>
            <span />
          </div>
          {items.map(item => (
            <div className="wl-row" key={item.id}>
              <span
                className="wl-symbol wl-symbol-link"
                onClick={() => setChartSymbol(item.symbol)}
                title="View chart"
              >{item.symbol}</span>
              <QuoteCell symbol={item.symbol} />
              <span className="wl-notes">
                {editId === item.id ? (
                  <span className="wl-edit-row">
                    <input
                      className="wl-input"
                      value={editNotes}
                      onChange={e => setEditNotes(e.target.value)}
                      autoFocus
                    />
                    <button className="btn-sm" onClick={() => saveNotes(item.id)}>Save</button>
                    <button className="btn-sm btn-ghost" onClick={() => setEditId(null)}>Cancel</button>
                  </span>
                ) : (
                  <span
                    className="wl-notes-text"
                    onClick={() => { setEditId(item.id); setEditNotes(item.notes || '') }}
                    title="Click to edit"
                  >
                    {item.notes || <em className="muted">add notes</em>}
                  </span>
                )}
              </span>
              <span className="wl-actions">
                <button className="btn-sm btn-ghost btn-danger" onClick={() => remove(item.id)}>✕</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
