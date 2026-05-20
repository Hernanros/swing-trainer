import React, { useState, useEffect } from 'react'
import { api } from '../api'

const TIER_COLORS = { must: 'var(--red)', should: 'var(--yellow)', context: 'var(--accent)' }
const TIER_LABELS = { must: 'Must-Have', should: 'Should-Have', context: 'Context Note' }

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
    setup_type:   '',
    practice:     false,
  })
  const [errors, setErrors]   = useState({})
  const [saving, setSaving]   = useState(false)
  const [setups, setSetups]   = useState([])
  const [rules, setRules]     = useState([])
  const [checked, setChecked] = useState({})

  useEffect(() => {
    if (mode !== 'open') return
    api.playbook.setups().then(setSetups).catch(() => {})
  }, [mode])

  useEffect(() => {
    if (mode !== 'open' || !form.setup_type) { setRules([]); setChecked({}); return }
    api.playbook.rules(form.setup_type).then(r => {
      setRules(r)
      setChecked(Object.fromEntries(r.map(rule => [rule.id, false])))
    }).catch(() => {})
  }, [form.setup_type, mode])

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

  function toggleRule(id) {
    setChecked(c => ({ ...c, [id]: !c[id] }))
  }

  function computeChecklistScore() {
    const scoreable = rules.filter(r => r.tier === 'must' || r.tier === 'should')
    if (scoreable.length === 0) return null
    const checkedCount = scoreable.filter(r => checked[r.id]).length
    return Math.round((checkedCount / scoreable.length) * 100)
  }

  const mustUnchecked = rules.filter(r => r.tier === 'must' && !checked[r.id])

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
            symbol:          form.symbol.trim(),
            direction:       form.direction,
            entry_price:     +form.entry_price,
            stop_price:      +form.stop_price,
            target_price:    +form.target_price,
            shares:          +form.shares,
            pre_note:        form.pre_note.trim(),
            setup_type:      form.setup_type || null,
            practice:        form.practice,
            checklist_score: computeChecklistScore(),
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

  const submitDisabled = saving || (mode === 'open' && mustUnchecked.length > 0)

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 99 }}
      />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 300,
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
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 18, cursor: 'pointer' }}
          >✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'open' && <>
            {field('symbol', 'Symbol', 'text', 'NVDA')}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)' }}>Setup Type</label>
              {setups.length > 0 ? (
                <select
                  value={form.setup_type}
                  onChange={e => set('setup_type', e.target.value)}
                  style={{
                    background: 'var(--surface2)', border: '1px solid var(--border2)',
                    borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: 13, outline: 'none',
                  }}
                >
                  <option value="">— None —</option>
                  {setups.map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.setup_type}
                  onChange={e => set('setup_type', e.target.value)}
                  placeholder="Breakout, Pullback… (optional)"
                  style={{
                    background: 'var(--surface2)', border: '1px solid var(--border2)',
                    borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: 13, outline: 'none',
                  }}
                />
              )}
            </div>

            {rules.length > 0 && (
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>
                  Playbook Checklist
                  {mustUnchecked.length > 0 && (
                    <span style={{ color: 'var(--red)', marginLeft: 8 }}>
                      {mustUnchecked.length} must-have unchecked
                    </span>
                  )}
                </div>
                {['must', 'should', 'context'].map(tier => {
                  const tierRules = rules.filter(r => r.tier === tier)
                  if (tierRules.length === 0) return null
                  return (
                    <div key={tier}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: TIER_COLORS[tier], marginBottom: 4, letterSpacing: '0.06em' }}>
                        {TIER_LABELS[tier]}
                      </div>
                      {tierRules.map(rule => (
                        <label key={rule.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', marginBottom: 4 }}>
                          {tier !== 'context' ? (
                            <input
                              type="checkbox"
                              checked={!!checked[rule.id]}
                              onChange={() => toggleRule(rule.id)}
                              style={{ marginTop: 2, flexShrink: 0 }}
                            />
                          ) : (
                            <span style={{ width: 14, height: 14, flexShrink: 0 }} />
                          )}
                          <span style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.4 }}>{rule.text}</span>
                        </label>
                      ))}
                    </div>
                  )
                })}
                {computeChecklistScore() !== null && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4 }}>
                    Score: <strong style={{ color: 'var(--text)' }}>{computeChecklistScore()}%</strong>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)' }}>Direction</label>
              <select
                value={form.direction}
                onChange={e => set('direction', e.target.value)}
                style={{
                  background: 'var(--surface2)', border: '1px solid var(--border2)',
                  borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: 13, outline: 'none',
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

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.practice}
                onChange={e => set('practice', e.target.checked)}
              />
              Practice / paper trade
            </label>
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

          {errors._form && <div style={{ color: 'var(--red)', fontSize: 12 }}>{errors._form}</div>}

          <button
            type="submit"
            disabled={submitDisabled}
            style={{
              background: '#238636', color: '#fff', border: 'none', borderRadius: 7,
              padding: '10px', fontSize: 13, fontWeight: 600,
              cursor: submitDisabled ? 'not-allowed' : 'pointer', opacity: submitDisabled ? 0.5 : 1,
            }}
          >
            {saving ? 'Saving…' : mode === 'open' ? 'Open Trade' : 'Close Trade'}
          </button>
        </form>
      </div>
    </>
  )
}
