import React, { useState, useEffect } from 'react'

export default function TradeDrawer({ mode, trade, onSubmit, onClose }) {
  const [form, setForm] = useState({
    symbol:       '',
    direction:    'long',
    entry_price:  '',
    shares:       '',
    stop_price:   '',
    target_price: '',
    pre_note:     '',
    exit_price:   '',
    debrief:      '',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (mode === 'close' && trade) {
      setForm(f => ({ ...f, exit_price: '', debrief: '' }))
    }
    setErrors({})
  }, [mode, trade])

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }))
    setErrors(e => ({ ...e, [key]: undefined }))
  }

  function validate() {
    const errs = {}
    if (mode === 'open') {
      if (!form.symbol.trim())                              errs.symbol       = 'Required'
      if (!['long','short'].includes(form.direction))       errs.direction    = 'Must be long or short'
      if (!form.entry_price  || +form.entry_price  <= 0)   errs.entry_price  = 'Must be > 0'
      if (!form.stop_price   || +form.stop_price   <= 0)   errs.stop_price   = 'Must be > 0'
      if (!form.target_price || +form.target_price <= 0)   errs.target_price = 'Must be > 0'
      if (!form.shares       || +form.shares       < 1)    errs.shares       = 'Must be >= 1'
      if (+form.stop_price   === +form.entry_price)        errs.stop_price   = 'Stop must differ from entry'
    } else {
      if (!form.exit_price || +form.exit_price <= 0)       errs.exit_price   = 'Must be > 0'
      if (!form.debrief.trim())                            errs.debrief      = 'Required'
    }
    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      const data = mode === 'open'
        ? {
            symbol:       form.symbol.trim(),
            direction:    form.direction,
            entry_price:  +form.entry_price,
            stop_price:   +form.stop_price,
            target_price: +form.target_price,
            shares:       +form.shares,
            pre_note:     form.pre_note.trim(),
          }
        : {
            exit_price: +form.exit_price,
            debrief:    form.debrief.trim(),
          }
      await onSubmit(data)
      onClose()
    } catch (err) {
      setErrors({ _form: err.message })
    } finally {
      setSaving(false)
    }
  }

  const field = (key, label, type = 'text', placeholder = '') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => set(key, e.target.value)}
        placeholder={placeholder}
        style={{
          background: 'var(--surface2)',
          border: `1px solid ${errors[key] ? 'var(--red)' : 'var(--border2)'}`,
          borderRadius: 6, color: 'var(--text)', padding: '7px 10px',
          fontSize: 13, outline: 'none', width: '100%',
        }}
      />
      {errors[key] && <span style={{ color: 'var(--red)', fontSize: 11 }}>{errors[key]}</span>}
    </div>
  )

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 99 }}
      />

      {/* Drawer panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 280,
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        zIndex: 100, overflowY: 'auto', padding: 20,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 15 }}>
            {mode === 'open' ? 'Open Trade' : `Close — ${trade?.symbol}`}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
          >✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'open' && <>
            {field('symbol',       'Symbol',       'text',   'NVDA')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)' }}>Direction</label>
              <select
                value={form.direction}
                onChange={e => set('direction', e.target.value)}
                style={{
                  background: 'var(--surface2)', border: '1px solid var(--border2)',
                  borderRadius: 6, color: 'var(--text)', padding: '7px 10px',
                  fontSize: 13, outline: 'none',
                }}
              >
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </div>
            {field('entry_price',  'Entry Price',  'number', '900.00')}
            {field('shares',       'Shares',       'number', '10')}
            {field('stop_price',   'Stop Price',   'number', '885.00')}
            {field('target_price', 'Target Price', 'number', '940.00')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)' }}>Pre-trade note (optional)</label>
              <textarea
                value={form.pre_note}
                onChange={e => set('pre_note', e.target.value)}
                rows={3}
                placeholder="Why is this a valid setup?"
                style={{
                  background: 'var(--surface2)', border: '1px solid var(--border2)',
                  borderRadius: 6, color: 'var(--text)', padding: '7px 10px',
                  fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'var(--font)',
                }}
              />
            </div>
          </>}

          {mode === 'close' && <>
            <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>
              <div>{trade?.direction?.toUpperCase()} · Entry ${trade?.entry_price} · {trade?.shares} shares</div>
              <div>Stop ${trade?.stop_price} · Target ${trade?.target_price}</div>
            </div>
            {field('exit_price', 'Exit Price', 'number', '930.00')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)' }}>
                Debrief <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <textarea
                value={form.debrief}
                onChange={e => set('debrief', e.target.value)}
                rows={4}
                placeholder="What happened? What would you do differently?"
                style={{
                  background: 'var(--surface2)',
                  border: `1px solid ${errors.debrief ? 'var(--red)' : 'var(--border2)'}`,
                  borderRadius: 6, color: 'var(--text)', padding: '7px 10px',
                  fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'var(--font)',
                }}
              />
              {errors.debrief && <span style={{ color: 'var(--red)', fontSize: 11 }}>{errors.debrief}</span>}
            </div>
          </>}

          {errors._form && (
            <div style={{ color: 'var(--red)', fontSize: 12 }}>{errors._form}</div>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{
              background: '#238636', color: '#fff', border: 'none', borderRadius: 7,
              padding: '10px', fontSize: 13, fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : mode === 'open' ? 'Open Trade' : 'Close Trade'}
          </button>
        </form>
      </div>
    </>
  )
}
