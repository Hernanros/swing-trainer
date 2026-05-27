import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import ChartModal from '../components/ChartModal'

const TAG_GROUPS = {
  Setup:    ['VCP', 'Cup & Handle', 'Flat Base', 'Breakout', 'Pullback'],
  Stage:    ['Watching', 'Ready to Buy', 'Passed'],
  Priority: ['High', 'Medium', 'Low'],
}

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

function EarningsCell({ symbol }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api.market.earnings(symbol)
      .then(d  => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [symbol])

  if (loading) return <span className="wl-price muted">…</span>
  if (!data?.date) return <span className="wl-price muted wl-earnings">—</span>

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const erDate = new Date(data.date + 'T00:00:00')
  const daysUntil = Math.round((erDate - today) / 86400000)

  if (daysUntil < 0)  return <span className="wl-price muted wl-earnings">—</span>
  if (daysUntil === 0) return <span className="wl-price red wl-earnings">ER today</span>
  if (daysUntil === 1) return <span className="wl-price red wl-earnings">ER tomorrow</span>
  return <span className="wl-price wl-earnings" style={{ color: 'var(--yellow)' }}>ER in {daysUntil}d</span>
}

export default function Watchlist() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [symbol, setSymbol] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [editId, setEditId] = useState(null)
  const [editNotes, setEditNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [chartSymbol, setChartSymbol] = useState(null)
  const [tagEditId, setTagEditId] = useState(null)

  const load = useCallback(() => {
    api.watchlist.list().then(setItems).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!tagEditId) return
    const close = (e) => {
      if (!e.target.closest('.wl-tag-picker') && !e.target.closest('.wl-tag-add'))
        setTagEditId(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [tagEditId])

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
    const updated = await api.watchlist.updateNotes(id, editNotes)
    setItems(prev => prev.map(i => i.id === id ? { ...i, notes: updated.notes } : i))
    setEditId(null)
  }

  async function saveTags(id, tags) {
    const updated = await api.watchlist.updateTags(id, tags)
    setItems(prev => prev.map(i => i.id === id ? { ...i, tags: updated.tags } : i))
  }

  async function toggleTag(item, tag) {
    const current = item.tags || []
    const next = current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag]
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, tags: next } : i))
    try {
      await saveTags(item.id, next)
    } catch (e) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, tags: current } : i))
      setError('Failed to update tags')
    }
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
            <span>Earnings</span>
            <span>Notes</span>
            <span>Action</span>
            <span />
          </div>
          {items.map(item => (
            <div className="wl-row" key={item.id} style={{ position: 'relative' }}>
              <span
                className="wl-symbol wl-symbol-link"
                onClick={() => setChartSymbol(item.symbol)}
                title="View chart"
              >{item.symbol}</span>
              <QuoteCell symbol={item.symbol} />
              <EarningsCell symbol={item.symbol} />
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
              <span>
                <button
                  className="btn-sm btn-ghost"
                  style={{ fontSize: 11 }}
                  onClick={() => navigate('/journal', { state: { prefill: { symbol: item.symbol } } })}
                >
                  Trade →
                </button>
              </span>
              <span className="wl-actions">
                <button className="btn-sm btn-ghost btn-danger" onClick={() => remove(item.id)}>✕</button>
              </span>
              {/* Tag row */}
              <div className="wl-tags-row">
                {(item.tags || []).map(t => (
                  <span key={t} className="wl-tag active" onClick={() => toggleTag(item, t)}>{t} ✕</span>
                ))}
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <button
                    className="btn-sm btn-ghost wl-tag-add"
                    onClick={() => setTagEditId(tagEditId === item.id ? null : item.id)}
                  >+ tag</button>
                  {tagEditId === item.id && (
                    <div className="wl-tag-picker">
                      {Object.entries(TAG_GROUPS).map(([group, tags]) => (
                        <div key={group} className="wl-tag-group">
                          <span className="wl-tag-group-label">{group}</span>
                          {tags.map(tag => (
                            <span
                              key={tag}
                              className={`wl-tag ${(item.tags || []).includes(tag) ? 'active' : ''}`}
                              onClick={() => toggleTag(item, tag)}
                            >{tag}</span>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
