import { useState, useEffect } from 'react'
import { api } from '../api'

export default function Bull() {
  const [scan, setScan] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [running, setRunning] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [profileForm, setProfileForm] = useState({ account_size: '', risk_per_trade_pct: 1.0, max_contracts: 5 })
  const [savingProfile, setSavingProfile] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatHistory, setChatHistory] = useState([])
  const [chatLoading, setChatLoading] = useState(false)

  useEffect(() => {
    Promise.all([
      api.bull.latestScan().catch(() => null),
      api.bull.getProfile().catch(() => null),
    ]).then(([scanData, profileData]) => {
      setScan(scanData)
      setProfile(profileData)
      if (profileData) {
        setProfileForm({
          account_size: profileData.account_size,
          risk_per_trade_pct: profileData.risk_per_trade_pct,
          max_contracts: profileData.max_contracts,
        })
      }
    }).catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleRunScan() {
    setRunning(true)
    setError(null)
    try {
      await api.bull.runScan()
      const fresh = await api.bull.latestScan()
      setScan(fresh)
    } catch (e) {
      setError(e.message || 'Scan failed')
    } finally {
      setRunning(false)
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault()
    setSavingProfile(true)
    try {
      const saved = await api.bull.putProfile({
        account_size: parseFloat(profileForm.account_size),
        risk_per_trade_pct: parseFloat(profileForm.risk_per_trade_pct),
        max_contracts: parseInt(profileForm.max_contracts, 10),
      })
      setProfile(saved)
      setShowProfile(false)
    } catch (e) {
      setError(e.message || 'Could not save profile')
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleChat(e) {
    e.preventDefault()
    if (!chatInput.trim()) return
    const question = chatInput.trim()
    setChatInput('')
    setChatHistory(h => [...h, { role: 'user', text: question }])
    setChatLoading(true)
    try {
      const resp = await api.bull.chat({ question })
      setChatHistory(h => [...h, { role: 'assistant', text: resp.answer }])
    } catch {
      setChatHistory(h => [...h, { role: 'assistant', text: '[Chat unavailable]' }])
    } finally {
      setChatLoading(false)
    }
  }

  if (loading) return (
    <div style={{ padding: 32, color: 'var(--muted)' }}>Loading scan…</div>
  )

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>BULL ASSISTANT</h1>
          {scan && (
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0' }}>
              Last scan: {scan.scan_date} at {scan.created_at ? scan.created_at.slice(11, 16) + ' UTC' : '—'}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowProfile(true)}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 5, color: 'var(--text2)', padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}
          >
            ⚙ Profile
          </button>
          <button
            onClick={handleRunScan}
            disabled={running}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: 5, color: '#111', padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer', opacity: running ? 0.6 : 1 }}
          >
            {running ? 'Running…' : 'Run Scan'}
          </button>
        </div>
      </div>

      {error && (
        <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>{error}</p>
      )}

      {!scan ? (
        <NoScanState profile={profile} onRunScan={handleRunScan} running={running} />
      ) : (
        <>
          <MacroBar macro={scan.macro} />
          <SectorStrip sectors={scan.sectors} />
          <CandidatesTable candidates={scan.candidates} />
          <AssistantPlaybookPanel />
          <ChatPanel
            history={chatHistory}
            input={chatInput}
            onInputChange={e => setChatInput(e.target.value)}
            onSubmit={handleChat}
            loading={chatLoading}
          />
        </>
      )}

      {showProfile && (
        <ProfileModal
          form={profileForm}
          onChange={setProfileForm}
          onSave={handleSaveProfile}
          onClose={() => setShowProfile(false)}
          saving={savingProfile}
        />
      )}
    </div>
  )
}

function NoScanState({ profile, onRunScan, running }) {
  return (
    <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)' }}>
      {!profile ? (
        <>
          <p style={{ fontSize: 14, marginBottom: 8 }}>Set your account profile to get started.</p>
          <p style={{ fontSize: 12 }}>Click ⚙ Profile above to enter your account size and risk tolerance.</p>
        </>
      ) : (
        <>
          <p style={{ fontSize: 14, marginBottom: 12 }}>No scan available yet. Next automatic scan runs at 5 PM ET on trading days.</p>
          <button
            onClick={onRunScan}
            disabled={running}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: 5, color: '#111', padding: '8px 20px', fontSize: 13, fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer' }}
          >
            {running ? 'Running…' : 'Run Scan Now'}
          </button>
        </>
      )}
    </div>
  )
}

function MacroBar({ macro }) {
  if (!macro) return null
  const spy = macro.spy || {}
  const qqq = macro.qqq || {}
  const regimeColor = r => r === 'bullish' ? '#4c4' : r === 'bearish' ? 'var(--red)' : 'var(--muted)'
  const regimeArrow = r => r === 'bullish' ? '▲' : r === 'bearish' ? '▼' : '→'
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
      {[['SPY', spy.regime], ['QQQ', qqq.regime]].map(([sym, regime]) => (
        <div key={sym} style={{ background: 'var(--surface2)', borderRadius: 6, padding: '6px 14px', fontSize: 12, color: regimeColor(regime) }}>
          <span style={{ fontWeight: 700 }}>{sym}</span> {regimeArrow(regime)} {regime || 'unknown'}
        </div>
      ))}
    </div>
  )
}

function SectorStrip({ sectors }) {
  if (!sectors || sectors.length === 0) return null
  const labelColor = l => l === 'strong' ? '#4c4' : l === 'weak' ? 'var(--red)' : 'var(--muted)'
  const labelArrow = l => l === 'strong' ? '▲' : l === 'weak' ? '▼' : '→'
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
      {sectors.map(s => (
        <div key={s.symbol} style={{ background: 'var(--surface2)', borderRadius: 4, padding: '3px 8px', fontSize: 11, color: labelColor(s.label) }}>
          {s.symbol} {labelArrow(s.label)}
          <span style={{ color: 'var(--muted)', marginLeft: 3 }}>
            {s.pct_vs_20d >= 0 ? '+' : ''}{s.pct_vs_20d?.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  )
}

function ScoreBadge({ value, label, primary }) {
  if (value == null || value === '—') return null
  const n = typeof value === 'number' ? value : parseFloat(value)
  const color = n >= 7 ? 'var(--green)' : n >= 4.5 ? 'var(--accent)' : 'var(--red)'
  if (primary) return (
    <span style={{ fontWeight: 700, color, fontSize: 14 }}>{n.toFixed(1)}</span>
  )
  return (
    <span style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--surface3,var(--surface2))', borderRadius: 4, padding: '1px 5px', border: '1px solid var(--border2)', whiteSpace: 'nowrap' }}>
      AI <span style={{ color, fontWeight: 600 }}>{n.toFixed(1)}</span>
    </span>
  )
}

function CandidatesTable({ candidates }) {
  const [expanded, setExpanded] = useState(null)
  if (!candidates || candidates.length === 0) {
    return (
      <div style={{ padding: '20px 0', color: 'var(--muted)', fontSize: 13 }}>
        No setups met criteria today — market conditions may be unfavorable.
      </div>
    )
  }
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '60px 65px 65px 70px 80px 50px 1fr', gap: '0 12px', padding: '4px 8px', fontSize: 10, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.05em', borderBottom: '1px solid var(--border2)', marginBottom: 4 }}>
        <span>TICKER</span>
        <span>YOUR SCORE</span>
        <span>AI SCORE</span>
        <span>CONTRACTS</span><span>MAX LOSS</span><span>IV</span><span>SECTOR</span>
      </div>
      {candidates.map((c, i) => (
        <div key={c.symbol}>
          <div
            onClick={() => setExpanded(expanded === i ? null : i)}
            style={{ display: 'grid', gridTemplateColumns: '60px 65px 65px 70px 80px 50px 1fr', gap: '0 12px', padding: '8px 8px', fontSize: 13, cursor: 'pointer', borderRadius: 4, background: i === 0 ? 'var(--surface2)' : 'transparent', color: i === 0 ? 'var(--accent)' : 'var(--text2)', borderBottom: '1px solid var(--border2)', alignItems: 'center' }}
          >
            <span style={{ fontWeight: i === 0 ? 700 : 400 }}>{c.symbol}</span>
            <span>{c.score != null ? <ScoreBadge value={c.score} primary /> : <span style={{ color: 'var(--muted)' }}>—</span>}</span>
            <span><ScoreBadge value={c.asst_score} primary /></span>
            <span>{c.contracts ?? '—'}</span>
            <span>${c.max_loss_per_contract != null ? c.max_loss_per_contract.toLocaleString() : '—'}</span>
            <span>{c.ivr != null ? Math.round(c.ivr) + '%' : c.iv != null ? (c.iv * 100).toFixed(0) + '%' : '—'}</span>
            <span style={{ color: 'var(--muted)', fontSize: 11 }}>{c.sector || '—'} {c.sector_label === 'strong' ? '▲' : c.sector_label === 'weak' ? '▼' : '→'}</span>
          </div>
          {expanded === i && (
            <div style={{ background: 'var(--surface2)', borderRadius: 4, padding: '10px 12px', margin: '0 0 4px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {c.score != null && (
                <div><strong style={{ color: 'var(--accent)' }}>Your playbook ({c.score?.toFixed(1)}/10):</strong> {c.rationale || '—'}</div>
              )}
              {c.asst_rationale && (
                <div><strong style={{ color: 'var(--muted)' }}>Bull AI ({c.asst_score?.toFixed(1)}/10):</strong> {c.asst_rationale}</div>
              )}
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                Risk budget: ${c.risk_dollars?.toLocaleString() ?? '—'} · ATM strike: ${c.atm_strike ?? '—'} · Expiry: {c.nearest_expiry ?? '—'}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function AssistantPlaybookPanel() {
  const [open, setOpen] = useState(false)
  const [rules, setRules] = useState(null)
  const [seeded, setSeeded] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [seedMsg, setSeedMsg] = useState(null)

  async function load() {
    if (rules) { setOpen(o => !o); return }
    try {
      const data = await api.bull.assistantPlaybook()
      setRules(data.rules)
      setOpen(true)
    } catch {
      setRules([])
      setOpen(true)
    }
  }

  async function handleSeed() {
    setSeeding(true)
    try {
      const resp = await api.bull.seedPlaybook()
      setSeeded(true)
      setSeedMsg(resp.already_seeded ? 'already' : 'saved')
    } catch {
      setSeedMsg('error')
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        onClick={load}
        style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
      >
        {open ? '▲ Hide' : '▼ View'} Bull AI Playbook
      </button>
      {open && rules && (
        <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '10px 14px', marginTop: 8, fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 8px', fontWeight: 700, letterSpacing: '0.05em' }}>
            BULL ASSISTANT PLAYBOOK — 6 rules for bull put spreads
          </p>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {rules.map((r, i) => <li key={i}>{r}</li>)}
          </ol>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            {seedMsg === 'saved' ? (
              <span style={{ fontSize: 11, color: 'var(--green)' }}>
                ✓ Saved as Bull Put Spread —{' '}
                <a href="/playbook" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>View in Playbook</a>
              </span>
            ) : seedMsg === 'already' ? (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                ✓ Already in Playbook —{' '}
                <a href="/playbook" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>View in Playbook</a>
              </span>
            ) : seedMsg === 'error' ? (
              <span style={{ fontSize: 11, color: 'var(--red)' }}>Could not save — try again.</span>
            ) : (
              <button
                onClick={handleSeed}
                disabled={seeding || seeded}
                style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 5, color: 'var(--accent)', fontSize: 11, padding: '4px 10px', cursor: seeding ? 'not-allowed' : 'pointer', opacity: seeding ? 0.6 : 1 }}
              >
                {seeding ? 'Saving…' : 'Save to My Playbook →'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ChatPanel({ history, input, onInputChange, onSubmit, loading }) {
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px' }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.05em', margin: '0 0 10px' }}>CHAT</p>
      {history.length > 0 && (
        <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
          {history.map((msg, i) => (
            <div key={i} style={{ fontSize: 13, color: msg.role === 'user' ? 'var(--text2)' : 'var(--muted)', lineHeight: 1.5 }}>
              <span style={{ fontWeight: 700, color: msg.role === 'user' ? 'var(--accent)' : 'var(--muted)', marginRight: 6 }}>
                {msg.role === 'user' ? 'You' : 'Bull'}
              </span>
              {msg.text}
            </div>
          ))}
          {loading && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Thinking…</div>}
        </div>
      )}
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={onInputChange}
          placeholder="Ask about any ticker or the scan…"
          disabled={loading}
          style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 5, color: 'var(--text)', padding: '6px 10px', fontSize: 13 }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{ background: 'var(--accent)', border: 'none', borderRadius: 5, color: '#111', padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: loading || !input.trim() ? 'not-allowed' : 'pointer', opacity: loading || !input.trim() ? 0.5 : 1 }}
        >
          Ask
        </button>
      </form>
    </div>
  )
}

function ProfileModal({ form, onChange, onSave, onClose, saving }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 10, padding: 28, width: 340, border: '1px solid var(--border2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Account Profile</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
        <form onSubmit={onSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>
            Account Size ($)
            <input
              type="number"
              value={form.account_size}
              onChange={e => onChange(f => ({ ...f, account_size: e.target.value }))}
              required
              min="1"
              style={{ display: 'block', width: '100%', marginTop: 4, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 5, color: 'var(--text)', padding: '6px 10px', fontSize: 13, boxSizing: 'border-box' }}
            />
          </label>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>
            Risk Per Trade (%)
            <input
              type="number"
              value={form.risk_per_trade_pct}
              onChange={e => onChange(f => ({ ...f, risk_per_trade_pct: e.target.value }))}
              required
              min="0.1"
              max="10"
              step="0.1"
              style={{ display: 'block', width: '100%', marginTop: 4, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 5, color: 'var(--text)', padding: '6px 10px', fontSize: 13, boxSizing: 'border-box' }}
            />
          </label>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>
            Max Contracts Per Trade
            <input
              type="number"
              value={form.max_contracts}
              onChange={e => onChange(f => ({ ...f, max_contracts: e.target.value }))}
              required
              min="1"
              max="50"
              style={{ display: 'block', width: '100%', marginTop: 4, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 5, color: 'var(--text)', padding: '6px 10px', fontSize: 13, boxSizing: 'border-box' }}
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: 5, color: '#111', padding: '8px', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', marginTop: 4 }}
          >
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
        </form>
      </div>
    </div>
  )
}
