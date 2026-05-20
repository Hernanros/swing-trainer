import React, { useState } from 'react'
import { api } from '../api'
import { useUser } from '../context/UserContext'

const SKILLS = [
  { key: 'chart_reading',       label: 'Chart Reading',       desc: 'Key levels, trend structure, setup validity' },
  { key: 'entry_timing',        label: 'Entry Timing',        desc: 'Precision and confirmation of entries' },
  { key: 'risk_sizing',         label: 'Risk & Sizing',       desc: 'Position sizing, stop adherence' },
  { key: 'setup_selection',     label: 'Setup Selection',     desc: 'Avoiding low-quality setups' },
  { key: 'trade_management',    label: 'Trade Management',    desc: 'Holding through noise, managing exits' },
  { key: 'emotional_discipline',label: 'Emotional Discipline',desc: 'FOMO, revenge trading, execution' },
]

const STAGES = [
  { key: 'learning',    label: 'Still Learning',    desc: 'Not trading real money yet' },
  { key: 'small_money', label: 'Small Real Money',  desc: 'Testing my edge with real stakes' },
  { key: 'active',      label: 'Active Trader',     desc: 'Trading regularly, scaling up' },
]

const BUDGETS = [
  { key: '15min', label: '15–20 min / day', desc: '1 drill + quick journal' },
  { key: '30min', label: '30–45 min / day', desc: '2 drills + learning module' },
  { key: '60min', label: '1 hour+ / day',   desc: 'Full session with chart study' },
]

export default function Onboarding() {
  const { users, addUser, switchUser, sessionEmail } = useUser()
  const [step, setStep]     = useState(users.length > 0 ? 'pick' : 'name')
  const [name, setName]     = useState('')
  const [stage, setStage]   = useState('')
  const [budget, setBudget] = useState('')
  const [skills, setSkills] = useState([])
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  function toggleSkill(key) {
    setSkills(prev => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key])
  }

  async function finish() {
    if (skills.length < 2) { setError('Select at least 2 skill areas'); return }
    if (skills.length > SKILLS.length) { setError('Too many skills selected'); return }
    setSaving(true)
    setError('')
    try {
      const u = await api.users.create({
        name,
        trading_stage: stage,
        time_budget: budget,
        active_skills: skills,
        email: sessionEmail || undefined,
      })
      addUser(u)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (step === 'pick') {
    return (
      <div className="onboarding">
        <h1>SwingTrainer</h1>
        <h2>Who's training today?</h2>
        <div className="user-pick-list">
          {users.map(u => (
            <button key={u.id} className="user-pick-btn" onClick={() => switchUser(u)}>
              {u.name}
            </button>
          ))}
        </div>
        <button className="link-btn" onClick={() => setStep('name')}>+ New user</button>
      </div>
    )
  }

  return (
    <div className="onboarding">
      <h1>SwingTrainer</h1>

      {step === 'name' && (
        <div className="onboarding-step">
          <h2>What's your name?</h2>
          <input
            className="onb-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && name.trim() && setStep('stage')}
          />
          <button className="onb-btn" disabled={!name.trim()} onClick={() => setStep('stage')}>
            Next →
          </button>
        </div>
      )}

      {step === 'stage' && (
        <div className="onboarding-step">
          <h2>Where are you in your trading journey?</h2>
          {STAGES.map(s => (
            <div
              key={s.key}
              className={`onb-option${stage === s.key ? ' selected' : ''}`}
              onClick={() => setStage(s.key)}
            >
              <strong>{s.label}</strong>
              <span>{s.desc}</span>
            </div>
          ))}
          <button className="onb-btn" disabled={!stage} onClick={() => setStep('budget')}>Next →</button>
        </div>
      )}

      {step === 'budget' && (
        <div className="onboarding-step">
          <h2>How much time can you give daily?</h2>
          {BUDGETS.map(b => (
            <div
              key={b.key}
              className={`onb-option${budget === b.key ? ' selected' : ''}`}
              onClick={() => setBudget(b.key)}
            >
              <strong>{b.label}</strong>
              <span>{b.desc}</span>
            </div>
          ))}
          <button className="onb-btn" disabled={!budget} onClick={() => setStep('skills')}>Next →</button>
        </div>
      )}

      {step === 'skills' && (
        <div className="onboarding-step">
          <h2>Which areas do you want to develop?</h2>
          <p style={{fontSize:'0.8em',color:'var(--muted)',marginBottom:'4px'}}>Select 2–6</p>
          {SKILLS.map(s => (
            <div
              key={s.key}
              className={`onb-option${skills.includes(s.key) ? ' selected' : ''}`}
              onClick={() => toggleSkill(s.key)}
            >
              <strong>{s.label}</strong>
              <span>{s.desc}</span>
            </div>
          ))}
          {error && <p className="onb-error">{error}</p>}
          <button className="onb-btn" disabled={saving} onClick={finish}>
            {saving ? 'Setting up…' : 'Start Training →'}
          </button>
        </div>
      )}
    </div>
  )
}
