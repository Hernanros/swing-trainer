import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

const TIER_COLORS = { must: 'var(--red)', should: 'var(--yellow)', context: 'var(--accent)' }
const TIER_LABELS = { must: 'Must-Have', should: 'Should-Have', context: 'Context Note' }

export default function TradeDrawer({ mode, trade, onSubmit, onClose, prefill }) {
  const [form, setForm] = useState({
    symbol:               '',
    direction:            'long',
    entry_price:          '',
    shares:               '',
    stop_price:           '',
    target_price:         '',
    pre_note:             '',
    exit_price:           '',
    debrief:              '',
    setup_type:           '',
    practice:             false,
    trade_date:           new Date().toISOString().split('T')[0],
    trade_type:           'equity',
    option_spread_type:   '',
    option_expiry:        '',
    option_long_strike:   '',
    option_short_strike:  '',
  })
  const [errors, setErrors]   = useState({})
  const [saving, setSaving]   = useState(false)
  const [setups, setSetups]   = useState([])
  const [rules, setRules]     = useState([])
  const [checked, setChecked] = useState({})
  const [helperAccount, setHelperAccount] = useState('')
  const [helperRisk, setHelperRisk]       = useState('1')
  const suggestedShares = (() => {
    const account = +helperAccount
    const risk    = +helperRisk
    const entry   = +form.entry_price
    const stop    = +form.stop_price
    if (!account || !risk || !entry || !stop || entry === stop) return 0
    return Math.floor((account * risk / 100) / Math.abs(entry - stop))
  })()

  const optionMetrics = (() => {
    if (form.trade_type !== 'option_spread') return null
    const ls       = Math.abs(+form.option_long_strike - +form.option_short_strike)
    const entry    = +form.entry_price
    const contracts= +form.shares
    const st       = form.option_spread_type
    if (!form.option_long_strike || !form.option_short_strike || !ls || !entry || !contracts || !st) return null
    const isDebit = ['bull_call', 'bear_put'].includes(st)
    let maxLoss, maxProfit, breakeven
    if (isDebit) {
      maxLoss   = entry * contracts * 100
      maxProfit = (ls - entry) * contracts * 100
      breakeven = st === 'bull_call'
        ? +form.option_long_strike + entry
        : +form.option_long_strike - entry
    } else {
      maxLoss   = (ls - entry) * contracts * 100
      maxProfit = entry * contracts * 100
      breakeven = st === 'bull_put'
        ? +form.option_short_strike - entry
        : +form.option_short_strike + entry
    }
    return {
      maxLoss:   maxLoss.toFixed(2),
      maxProfit: maxProfit.toFixed(2),
      breakeven: breakeven.toFixed(2),
    }
  })()

  const suggestedContracts = (() => {
    if (form.trade_type !== 'option_spread') return 0
    const account = +helperAccount
    const risk    = +helperRisk
    const premium = +form.entry_price
    if (!account || !risk || !premium) return 0
    return Math.floor((account * risk / 100) / (premium * 100))
  })()

  const navigate = useNavigate()

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
    if (mode !== 'close') return
    if (!trade?.setup_type) { setRules([]); setChecked({}); return }
    api.playbook.rules(trade.setup_type)
      .then(r => {
        setRules(r)
        setChecked(Object.fromEntries(r.map(rule => [rule.id, false])))
      })
      .catch(() => {})
  }, [mode, trade])

  useEffect(() => {
    if (mode === 'close' && trade) {
      setForm(f => ({ ...f, exit_price: '', debrief: '' }))
    }
    setErrors({})
  }, [mode, trade])

  useEffect(() => {
    if (mode === 'open' && prefill?.symbol) {
      setForm(f => ({
        ...f,
        symbol: prefill.symbol,
        setup_type: prefill.setup_type || f.setup_type,
      }))
    }
  }, [mode, prefill])

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

  const mustUnchecked = mode === 'open' ? rules.filter(r => r.tier === 'must' && !checked[r.id]) : []

  function validate() {
    const errs = {}
    if (mode === 'open') {
      if (!form.symbol.trim()) errs.symbol = 'Required'
      if (form.trade_type === 'option_spread') {
        if (!form.option_spread_type)             errs.option_spread_type  = 'Required'
        if (!form.option_expiry)                  errs.option_expiry       = 'Required'
        if (!form.option_long_strike  || +form.option_long_strike  <= 0) errs.option_long_strike  = 'Must be > 0'
        if (!form.option_short_strike || +form.option_short_strike <= 0) errs.option_short_strike = 'Must be > 0'
        if (+form.option_long_strike === +form.option_short_strike) errs.option_short_strike = 'Must differ from long strike'
        if (!form.entry_price || +form.entry_price <= 0) errs.entry_price = 'Must be > 0'
        if (form.stop_price === '' || +form.stop_price < 0)  errs.stop_price   = 'Required (enter 0 if no stop)'
        if (!form.target_price || +form.target_price <= 0) errs.target_price = 'Must be > 0'
        if (!form.shares || +form.shares < 1) errs.shares = 'Must be >= 1'
      } else {
        if (!['long','short'].includes(form.direction))     errs.direction   = 'Must be long or short'
        if (!form.entry_price  || +form.entry_price  <= 0) errs.entry_price  = 'Must be > 0'
        if (!form.stop_price   || +form.stop_price   <= 0) errs.stop_price   = 'Must be > 0'
        if (!form.target_price || +form.target_price <= 0) errs.target_price = 'Must be > 0'
        if (!form.shares       || +form.shares       < 1)  errs.shares       = 'Must be >= 1'
        if (+form.stop_price   === +form.entry_price)      errs.stop_price   = 'Stop must differ from entry'
      }
    } else {
      if (!form.exit_price || +form.exit_price <= 0) errs.exit_price = 'Must be > 0'
      if (!form.debrief.trim())                      errs.debrief    = 'Required'
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
            ...(form.trade_type === 'equity' && { direction: form.direction }),
            entry_price:     +form.entry_price,
            stop_price:      +form.stop_price,
            target_price:    +form.target_price,
            shares:          +form.shares,
            pre_note:        form.pre_note.trim(),
            setup_type:      form.setup_type || null,
            practice:        form.practice,
            checklist_score: computeChecklistScore(),
            trade_date:      form.trade_date || null,
            trade_type:      form.trade_type,
            ...(form.trade_type === 'option_spread' && {
              option_spread_type:  form.option_spread_type,
              option_expiry:       form.option_expiry,
              option_long_strike:  +form.option_long_strike,
              option_short_strike: +form.option_short_strike,
            }),
          }
        : {
            exit_price:      +form.exit_price,
            debrief:         form.debrief.trim(),
            checklist_items: rules
              .filter(r => r.tier !== 'context')
              .map(r => ({ rule_id: r.id, checked: !!checked[r.id], tier: r.tier })),
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

  const checklistScore = computeChecklistScore()

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 99 }}
      />
      <div className="trade-drawer" style={{
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
            {/* Trade type toggle */}
            <div style={{ display: 'flex', gap: 6 }}>
              {['equity', 'option_spread'].map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set('trade_type', t)}
                  style={{
                    flex: 1, padding: '7px 0', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    border: `1px solid ${form.trade_type === t ? 'var(--accent)' : 'var(--border2)'}`,
                    background: form.trade_type === t ? '#58a6ff22' : 'transparent',
                    color: form.trade_type === t ? 'var(--accent)' : 'var(--muted)',
                    cursor: 'pointer',
                  }}
                >
                  {t === 'equity' ? 'Equity' : 'Option Spread'}
                </button>
              ))}
            </div>

            {field('symbol', 'Symbol', 'text', form.trade_type === 'option_spread' ? 'SPY' : 'NVDA')}
            {field('trade_date', 'Trade Date', 'date')}

            {/* Setup type — shown for all trade types */}
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
                {checklistScore !== null && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4 }}>
                    Score: <strong style={{ color: 'var(--text)' }}>{checklistScore}%</strong>
                  </div>
                )}
              </div>
            )}

            {/* Option spread fields */}
            {form.trade_type === 'option_spread' && <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, color: 'var(--muted)' }}>Spread Type</label>
                <select
                  value={form.option_spread_type}
                  onChange={e => set('option_spread_type', e.target.value)}
                  style={{ background: 'var(--surface2)', border: `1px solid ${errors.option_spread_type ? 'var(--red)' : 'var(--border2)'}`, borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: 13, outline: 'none' }}
                >
                  <option value="">— Select —</option>
                  <option value="bull_call">Bull Call (Debit)</option>
                  <option value="bear_put">Bear Put (Debit)</option>
                  <option value="bull_put">Bull Put (Credit)</option>
                  <option value="bear_call">Bear Call (Credit)</option>
                </select>
                {errors.option_spread_type && <span style={{ color: 'var(--red)', fontSize: 11 }}>{errors.option_spread_type}</span>}
              </div>

              {field('option_expiry', 'Expiration Date', 'date')}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {field('option_long_strike',  'Long Strike',  'number', '450')}
                {field('option_short_strike', 'Short Strike', 'number', '455')}
              </div>

              {field('entry_price', 'Net Premium / Contract', 'number', '1.50')}

              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                  Size Helper <span style={{ fontSize: 10, color: 'var(--dim)' }}>(optional)</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, color: 'var(--muted)' }}>Account $</label>
                    <input type="number" value={helperAccount} onChange={e => setHelperAccount(e.target.value)} placeholder="25000"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6, color: 'var(--text)', padding: '6px 8px', fontSize: 13, outline: 'none', width: '100%' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, color: 'var(--muted)' }}>Risk %</label>
                    <input type="number" value={helperRisk} onChange={e => setHelperRisk(e.target.value)} placeholder="1"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 6, color: 'var(--text)', padding: '6px 8px', fontSize: 13, outline: 'none', width: '100%' }} />
                  </div>
                </div>
                {suggestedContracts > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                      Suggested: <strong style={{ color: 'var(--text)' }}>{suggestedContracts} contracts</strong>
                      <span style={{ color: 'var(--muted)', marginLeft: 6 }}>= ${(suggestedContracts * +form.entry_price * 100).toFixed(0)} max risk</span>
                    </span>
                    <button type="button" className="btn-sm btn-ghost" style={{ fontSize: 11 }} onClick={() => set('shares', String(suggestedContracts))}>Use</button>
                  </div>
                )}
              </div>

              {field('shares',       'Contracts',       'number', '1')}
              {field('stop_price',   'Stop Premium',    'number', '0.75')}
              {field('target_price', 'Target Premium',  'number', '3.00')}

              {optionMetrics && (
                <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Max Risk</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', fontFamily: 'monospace' }}>${optionMetrics.maxLoss}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Max Profit</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', fontFamily: 'monospace' }}>${optionMetrics.maxProfit}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Breakeven</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace' }}>{optionMetrics.breakeven}</div>
                  </div>
                </div>
              )}
            </>}

            {/* Equity-only fields */}
            {form.trade_type === 'equity' && <>
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

              {field('entry_price', 'Entry Price', 'number', '900.00')}

              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                  Size Helper <span style={{ fontSize: 10, color: 'var(--dim)' }}>(optional)</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, color: 'var(--muted)' }}>Account $</label>
                    <input
                      type="number"
                      value={helperAccount}
                      onChange={e => setHelperAccount(e.target.value)}
                      placeholder="25000"
                      style={{
                        background: 'var(--bg)',
                        border: '1px solid var(--border2)',
                        borderRadius: 6, color: 'var(--text)', padding: '6px 8px',
                        fontSize: 13, outline: 'none', width: '100%',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, color: 'var(--muted)' }}>Risk %</label>
                    <input
                      type="number"
                      value={helperRisk}
                      onChange={e => setHelperRisk(e.target.value)}
                      placeholder="1"
                      style={{
                        background: 'var(--bg)',
                        border: '1px solid var(--border2)',
                        borderRadius: 6, color: 'var(--text)', padding: '6px 8px',
                        fontSize: 13, outline: 'none', width: '100%',
                      }}
                    />
                  </div>
                </div>
                {suggestedShares > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                      Suggested: <strong style={{ color: 'var(--text)' }}>{suggestedShares} shares</strong>
                    </span>
                    <button
                      type="button"
                      className="btn-sm btn-ghost"
                      style={{ fontSize: 11 }}
                      onClick={() => set('shares', String(suggestedShares))}
                    >
                      Use
                    </button>
                  </div>
                )}
              </div>

              {field('shares',       'Shares',       'number', '10')}
              {field('stop_price',   'Stop Price',   'number', '885.00')}
              {field('target_price', 'Target Price', 'number', '940.00')}
            </>}

            {/* Pre-note and practice — all trade types */}
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
              {(trade?.trade_type || 'equity') === 'option_spread' ? (
                <>
                  <div>{trade?.option_spread_type?.replace(/_/g, ' ').toUpperCase()} · {trade?.option_long_strike} / {trade?.option_short_strike} strike · {trade?.shares} contracts</div>
                  <div>Entry ${trade?.entry_price} · Exp: {trade?.option_expiry}</div>
                </>
              ) : (
                <>
                  <div>{trade?.direction?.toUpperCase()} · Entry ${trade?.entry_price} · {trade?.shares} shares</div>
                  <div>Stop ${trade?.stop_price} · Target ${trade?.target_price}</div>
                </>
              )}
            </div>

            {!trade?.setup_type ? (
              <div style={{ fontSize: 12, color: 'var(--dim)' }}>
                No setup type on this trade.{' '}
                <span style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={() => navigate('/playbook')}>
                  Build your playbook →
                </span>
              </div>
            ) : rules.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--dim)' }}>
                No playbook rules for "{trade.setup_type}" yet.{' '}
                <span style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={() => navigate('/playbook')}>
                  Add rules →
                </span>
              </div>
            ) : (
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>
                  Playbook Checklist — {trade.setup_type}
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
                {checklistScore !== null && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4 }}>
                    Score: <strong style={{ color: 'var(--text)' }}>{checklistScore}%</strong>
                  </div>
                )}
              </div>
            )}

            {field(
              'exit_price',
              (trade?.trade_type || 'equity') === 'option_spread' ? 'Exit Premium' : 'Exit Price',
              'number',
              (trade?.trade_type || 'equity') === 'option_spread' ? '3.00' : '930.00'
            )}
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
