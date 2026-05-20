import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../api'

const TIER_COLORS = {
  must:    'var(--red)',
  should:  'var(--yellow)',
  context: 'var(--accent)',
}
const TIER_LABELS = { must: 'Must-Have', should: 'Should-Have', context: 'Context Note' }
const TIERS = ['must', 'should', 'context']

export default function Playbook() {
  const [setups, setSetups]   = useState([])
  const [rules, setRules]     = useState({})   // { [setup_type]: PlaybookRuleResponse[] }
  const [loading, setLoading] = useState(true)
  const [newSetup, setNewSetup]   = useState('')
  const [addForms, setAddForms]   = useState({}) // { [setup_type]: { text, tier } }

  const reload = useCallback(async () => {
    const setupList = await api.playbook.setups()
    setSetups(setupList)
    const ruleMap = {}
    await Promise.all(
      setupList.map(async s => {
        ruleMap[s] = await api.playbook.rules(s)
      })
    )
    setRules(ruleMap)
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  async function handleAddSetup() {
    const name = newSetup.trim()
    if (!name) return
    await api.playbook.createRule({ setup_type: name, text: 'Setup created', tier: 'context', position: 0 })
    setNewSetup('')
    await reload()
  }

  async function handleAddRule(setupType) {
    const form = addForms[setupType] || { text: '', tier: 'must' }
    if (!form.text.trim()) return
    await api.playbook.createRule({
      setup_type: setupType,
      text: form.text.trim(),
      tier: form.tier,
      position: (rules[setupType] || []).length,
    })
    setAddForms(f => ({ ...f, [setupType]: { text: '', tier: 'must' } }))
    await reload()
  }

  async function handleDelete(ruleId) {
    await api.playbook.deleteRule(ruleId)
    await reload()
  }

  if (loading) return <div className="loading">Loading…</div>

  return (
    <div className="page">
      <h2 style={{ color: 'var(--text)', fontWeight: 700 }}>My Playbook</h2>

      <div className="playbook-section">
        <div style={{ fontWeight: 600, color: 'var(--text2)', fontSize: '0.88em', marginBottom: 4 }}>
          New Setup Type
        </div>
        <div className="setup-input-row">
          <input
            className="onb-input"
            style={{ fontSize: '0.9em', padding: '8px 12px' }}
            placeholder="e.g. Breakout, Pullback, Reversal…"
            value={newSetup}
            onChange={e => setNewSetup(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddSetup()}
          />
          <button className="playbook-add-btn" onClick={handleAddSetup} disabled={!newSetup.trim()}>
            Add Setup
          </button>
        </div>
      </div>

      {setups.length === 0 && (
        <div className="placeholder-card">No setup types yet. Add your first above.</div>
      )}

      {setups.map(setup => {
        const setupRules = rules[setup] || []
        const form = addForms[setup] || { text: '', tier: 'must' }

        return (
          <div key={setup} className="playbook-section">
            <div className="playbook-section-header">
              <span className="playbook-setup-title">{setup.charAt(0).toUpperCase() + setup.slice(1)}</span>
              <span style={{ color: 'var(--dim)', fontSize: '0.78em' }}>{setupRules.length} rules</span>
            </div>

            {TIERS.map(tier => {
              const tierRules = setupRules.filter(r => r.tier === tier)
              return (
                <div key={tier}>
                  <div className="playbook-tier-label" style={{ color: TIER_COLORS[tier] }}>
                    {TIER_LABELS[tier]}
                  </div>
                  {tierRules.length === 0 && (
                    <div style={{ color: 'var(--dim)', fontSize: '0.82em', padding: '4px 0' }}>None</div>
                  )}
                  {tierRules.map(rule => (
                    <div key={rule.id} className="playbook-rule-row">
                      <span className="playbook-rule-text">{rule.text}</span>
                      <button className="playbook-delete-btn" onClick={() => handleDelete(rule.id)}>✕</button>
                    </div>
                  ))}
                </div>
              )
            })}

            <div className="playbook-add-row" style={{ marginTop: 12 }}>
              <input
                placeholder="New rule…"
                value={form.text}
                onChange={e => setAddForms(f => ({ ...f, [setup]: { ...form, text: e.target.value } }))}
                onKeyDown={e => e.key === 'Enter' && handleAddRule(setup)}
              />
              <select
                value={form.tier}
                onChange={e => setAddForms(f => ({ ...f, [setup]: { ...form, tier: e.target.value } }))}
              >
                <option value="must">Must-Have</option>
                <option value="should">Should-Have</option>
                <option value="context">Context Note</option>
              </select>
              <button
                className="playbook-add-btn"
                onClick={() => handleAddRule(setup)}
                disabled={!form.text.trim()}
              >
                Add
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
