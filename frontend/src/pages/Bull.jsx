import { useState, useEffect } from 'react'
import { api } from '../api'

const SETUP_LABELS = {
  pullback_uptrend: 'Pullback in Uptrend',
  base_breakout:    'Base / Breakout',
  oversold_bounce:  'Oversold Bounce',
  range_support:    'Range at Support',
  none:             'No Setup',
}
const SETUP_SHORT = {
  pullback_uptrend: 'PULLBACK',
  base_breakout:    'BASE',
  oversold_bounce:  'BOUNCE',
  range_support:    'RANGE',
}
const SETUP_COLORS = {
  pullback_uptrend: { fg: '#58a6ff', bg: 'rgba(88,166,255,0.15)',  bd: 'rgba(88,166,255,0.35)' },
  base_breakout:    { fg: '#e3b341', bg: 'rgba(227,179,65,0.15)',  bd: 'rgba(227,179,65,0.35)' },
  oversold_bounce:  { fg: '#a371f7', bg: 'rgba(163,113,247,0.15)', bd: 'rgba(163,113,247,0.35)' },
  range_support:    { fg: '#3fb950', bg: 'rgba(63,185,80,0.15)',   bd: 'rgba(63,185,80,0.35)' },
}

function ScoreTooltip({ breakdown }) {
  if (!breakdown) return null
  const setupLabel = SETUP_LABELS[breakdown.setup_type] || 'None'
  const rows = [
    [`Setup — ${setupLabel}`, breakdown.setup, 60, breakdown.setup_why],
    ['Macro',      breakdown.macro,    10, breakdown.macro_why],
    ['Volume',     breakdown.volume,   10, breakdown.volume_why],
    ['52w Vol',    breakdown.vol_rank,  5, breakdown.vol_rank_why],
    ['Rel Str',    breakdown.rs,        5, breakdown.rs_why],
    ['Options',    breakdown.options,  10, breakdown.options_why],
  ]
  return (
    <div style={{
      position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
      zIndex: 60, background: 'var(--surface)', border: '1px solid var(--border2)',
      borderRadius: 6, padding: '12px 14px', minWidth: 260, fontSize: 11,
      color: 'var(--text2)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', marginTop: 6,
      pointerEvents: 'none',
    }}>
      <div style={{ fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 10, fontSize: 10 }}>SCORE BREAKDOWN</div>
      {rows.map(([label, pts, max, why]) => (
        <div key={label} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 2 }}>
            <span style={{ color: 'var(--muted)' }}>{label}</span>
            <span style={{ fontFamily: 'monospace', color: pts === max ? 'var(--green)' : pts > 0 ? 'var(--text)' : 'var(--muted)' }}>
              {pts ?? 0}/{max}
            </span>
          </div>
          {why && <div style={{ color: 'var(--muted)', fontSize: 10, lineHeight: 1.4 }}>{why}</div>}
        </div>
      ))}
    </div>
  )
}

const QUALITY_ORDER = { complete: 0, partial: 1, price_only: 2 }
const QUALITY_DOT   = { complete: '●', partial: '◑', price_only: '○' }
const QUALITY_COLOR = { complete: 'var(--green)', partial: 'var(--accent)', price_only: 'var(--muted)' }

function sortCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    const qa = QUALITY_ORDER[a.data_quality] ?? 3
    const qb = QUALITY_ORDER[b.data_quality] ?? 3
    if (qa !== qb) return qa - qb
    return (b.score ?? 0) - (a.score ?? 0)
  })
}

function scoreColor(score) {
  if (score >= 70) return 'var(--green)'
  if (score >= 50) return 'var(--accent)'
  return 'var(--muted)'
}


export default function Bull() {
  const [scan, setScan]               = useState(null)
  const [profile, setProfile]         = useState(null)
  const [kpis, setKpis]               = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [running, setRunning]         = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [profileForm, setProfileForm] = useState({ account_size: '', risk_per_trade_pct: 1.0, max_contracts: 5 })
  const [savingProfile, setSavingProfile] = useState(false)
  const [kpiOpen, setKpiOpen]         = useState(false)
  const [chatInput, setChatInput]     = useState('')
  const [chatHistory, setChatHistory] = useState([])
  const [chatLoading, setChatLoading] = useState(false)

  useEffect(() => {
    Promise.all([
      api.bull.latestScan().catch(() => null),
      api.bull.getProfile().catch(() => null),
      api.bull.kpis().catch(() => null),
    ]).then(([scanData, profileData, kpisData]) => {
      setScan(scanData)
      setKpis(kpisData)
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
      const [fresh, freshKpis] = await Promise.all([
        api.bull.latestScan(),
        api.bull.kpis().catch(() => null),
      ])
      setScan(fresh)
      setKpis(freshKpis)
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

  if (loading) return <div style={{ padding: 32, color: 'var(--muted)' }}>Loading scan…</div>

  return (
    <div style={{ padding: '24px 28px', maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
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

      {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>{error}</p>}

      <KpiStrip kpis={kpis} open={kpiOpen} onToggle={() => setKpiOpen(o => !o)} />

      {!scan ? (
        <NoScanState profile={profile} onRunScan={handleRunScan} running={running} />
      ) : (
        <>
          <MacroBar macro={scan.macro} />
          <SectorStrip sectors={scan.sectors} />
          <CandidatesTable candidates={scan.candidates} />
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

function KpiTile({ label, value, note, color }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text)', fontFamily: 'monospace' }}>{value ?? '—'}</div>
      {note && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{note}</div>}
    </div>
  )
}

function KpiStrip({ kpis, open, onToggle }) {
  const wr = kpis ? Math.round((kpis.win_rate ?? 0) * 100) : null
  const exp = kpis?.expectancy_per_dollar ?? null
  const hbWr = kpis ? Math.round(((kpis.score_edge?.high?.win_rate) ?? 0) * 100) : null

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        onClick={onToggle}
        style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: open ? '6px 6px 0 0' : 6, padding: '7px 14px', fontSize: 12, color: 'var(--text2)', cursor: 'pointer', width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span style={{ fontWeight: 700, letterSpacing: '0.06em', color: 'var(--muted)', fontSize: 10 }}>
          PERFORMANCE
        </span>
        {kpis && !open && (
          <span style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', gap: 18 }}>
            <span>{kpis.total_trades} trades</span>
            <span style={{ color: wr >= 60 ? 'var(--green)' : 'var(--muted)' }}>{wr}% WR</span>
            {exp != null && (
              <span style={{ color: exp >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {exp >= 0 ? '+' : ''}{exp.toFixed(2)} exp/$
              </span>
            )}
            {hbWr != null && (
              <span style={{ color: 'var(--muted)' }}>≥80: {hbWr}% WR</span>
            )}
          </span>
        )}
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ background: 'var(--surface2)', borderRadius: '0 0 6px 6px', padding: '16px 20px', border: '1px solid var(--border2)', borderTop: 'none' }}>
          {kpis && kpis.total_trades > 0 ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 14 }}>
                <KpiTile
                  label="PAPER TRADES"
                  value={kpis.total_trades}
                  note={`${kpis.open_trades} open`}
                />
                <KpiTile
                  label="WIN RATE"
                  value={`${wr}%`}
                  color={wr >= 60 ? 'var(--green)' : 'var(--muted)'}
                />
                <KpiTile
                  label="EXP / $1 RISKED"
                  value={exp != null ? (exp >= 0 ? `+${exp.toFixed(2)}` : exp.toFixed(2)) : '—'}
                  color={exp != null && exp >= 0 ? 'var(--green)' : 'var(--red)'}
                />
                <KpiTile
                  label="SCORE ≥80 WR"
                  value={`${hbWr}%`}
                  note={`${kpis.score_edge?.high?.count ?? 0} trades`}
                  color={hbWr >= 70 ? 'var(--green)' : 'var(--muted)'}
                />
              </div>
              <a href="/progress" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>
                Full breakdown in Progress →
              </a>
            </>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
              No resolved paper trades yet — data appears after first trades expire.
            </p>
          )}
        </div>
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
  const regimeColor = r => r === 'bullish' ? 'var(--green)' : r === 'bearish' ? 'var(--red)' : 'var(--muted)'
  const regimeArrow = r => r === 'bullish' ? '▲' : r === 'bearish' ? '▼' : '→'
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
      {[['SPY', spy.regime], ['QQQ', qqq.regime]].map(([sym, regime]) => (
        <div key={sym} style={{ background: 'var(--surface2)', borderRadius: 6, padding: '5px 12px', fontSize: 12, color: regimeColor(regime) }}>
          <span style={{ fontWeight: 700 }}>{sym}</span> {regimeArrow(regime)} {regime || 'unknown'}
        </div>
      ))}
    </div>
  )
}

function SectorStrip({ sectors }) {
  if (!sectors || sectors.length === 0) return null
  const labelColor = l => l === 'strong' ? 'var(--green)' : l === 'weak' ? 'var(--red)' : 'var(--muted)'
  const labelArrow = l => l === 'strong' ? '▲' : l === 'weak' ? '▼' : '→'
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
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

function MiniBar({ label, pts, max, why }) {
  const pct = Math.min(100, max > 0 ? Math.round((pts / max) * 100) : 0)
  const color = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--accent)' : 'var(--muted)'
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ color, fontFamily: 'monospace' }}>{pts}/{max}</span>
      </div>
      <div style={{ height: 4, background: 'var(--surface)', borderRadius: 2, overflow: 'hidden', marginBottom: why ? 3 : 0 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      {why && <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.4 }}>{why}</div>}
    </div>
  )
}

function StrikeCard({ label, value }) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace' }}>{value ?? '—'}</div>
    </div>
  )
}

function ExpandedRow({ c, logged, onLog, onDismiss }) {
  const bd = c.score_breakdown || {}
  const logState = logged[c.symbol]

  return (
    <div style={{ background: 'var(--surface2)', padding: '14px 16px', marginBottom: 2, borderBottom: '1px solid var(--border2)' }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 10 }}>
          SCORE BREAKDOWN — {c.score}/100
        </div>
        <MiniBar label={`Setup — ${SETUP_LABELS[bd.setup_type] || 'None'}`} pts={bd.setup ?? 0} max={60} why={bd.setup_why} />
        <MiniBar label="Macro Alignment"    pts={bd.macro ?? 0}    max={10} why={bd.macro_why} />
        <MiniBar label="Volume Ratio"       pts={bd.volume ?? 0}   max={10} why={bd.volume_why} />
        <MiniBar label="52w Vol Rank"       pts={bd.vol_rank ?? 0} max={5}  why={bd.vol_rank_why} />
        <MiniBar label="Relative Strength"  pts={bd.rs ?? 0}       max={5}  why={bd.rs_why} />
        <MiniBar label="Options Quality"    pts={bd.options ?? 0}  max={10} why={bd.options_why} />
      </div>

      {c.setup_brief && (
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.65, marginBottom: 14, padding: '10px 14px', background: 'var(--surface)', borderRadius: 6, borderLeft: '3px solid var(--accent)' }}>
          {c.setup_brief}
        </div>
      )}
      {!c.setup_brief && c.data_quality !== 'price_only' && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>No AI brief — options data incomplete at scan time.</div>
      )}

      {c.data_quality !== 'price_only' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 12 }}>
          <StrikeCard label="SHORT PUT" value={c.short_strike ? `$${c.short_strike}` : '—'} />
          <StrikeCard label="LONG PUT" value={c.long_strike ? `$${c.long_strike}` : '—'} />
          <StrikeCard label="EXPIRY" value={c.expiry ?? '—'} />
          <StrikeCard label="CREDIT" value={c.estimated_credit ? `$${c.estimated_credit.toFixed(2)}` : '—'} />
          <StrikeCard label="IV" value={c.atm_iv ? `${(c.atm_iv * 100).toFixed(0)}%` : '—'} />
        </div>
      )}

      {c.data_quality === 'partial' && (
        <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 12, padding: '6px 10px', background: 'rgba(255,180,0,0.07)', borderRadius: 5, border: '1px solid rgba(255,180,0,0.2)' }}>
          ⚠ Options data incomplete — verify in OptionStrat before trading.
        </div>
      )}
      {c.data_quality === 'price_only' && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, padding: '6px 10px', background: 'var(--surface)', borderRadius: 5 }}>
          Options data unavailable — verify in OptionStrat before trading.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {logState === 'done' ? (
          <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ Logged to paper trades</span>
        ) : logState === 'error' ? (
          <span style={{ fontSize: 12, color: 'var(--red)' }}>Could not log — try again</span>
        ) : (
          <button
            onClick={() => onLog(c)}
            disabled={logState === 'logging'}
            style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 5, color: 'var(--accent)', fontSize: 12, padding: '5px 12px', cursor: logState === 'logging' ? 'not-allowed' : 'pointer', opacity: logState === 'logging' ? 0.6 : 1 }}
          >
            {logState === 'logging' ? 'Logging…' : 'Auto-log Paper Trade'}
          </button>
        )}
        <button
          onClick={onDismiss}
          style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 5, color: 'var(--muted)', fontSize: 12, padding: '5px 12px', cursor: 'pointer' }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

function CandidatesTable({ candidates }) {
  const [expanded, setExpanded] = useState(null)
  const [logged, setLogged] = useState({})
  const [hoveredScore, setHoveredScore] = useState(null)

  if (!candidates || candidates.length === 0) {
    return <div style={{ padding: '20px 0', color: 'var(--muted)', fontSize: 13 }}>No setups met criteria today — market conditions may be unfavorable.</div>
  }

  const sorted = sortCandidates(candidates)
  const COL = '72px 64px 90px 72px 110px 1fr'

  async function handleLog(c) {
    setLogged(l => ({ ...l, [c.symbol]: 'logging' }))
    try {
      await api.bull.logPaperTrade({
        symbol: c.symbol,
        expiry: c.expiry,
        short_strike: c.short_strike,
        long_strike: c.long_strike,
        premium_credit: c.estimated_credit,
        score: c.score,
        data_quality: c.data_quality,
        channel_proximity: c.channel_proximity_pct,
        rsi_slope: c.rsi_slope,
      })
      setLogged(l => ({ ...l, [c.symbol]: 'done' }))
    } catch {
      setLogged(l => ({ ...l, [c.symbol]: 'error' }))
    }
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'grid', gridTemplateColumns: COL, gap: '0 12px', padding: '4px 8px', fontSize: 10, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.06em', borderBottom: '1px solid var(--border2)', marginBottom: 2 }}>
        <span>TICKER</span><span>SCORE</span><span>CHANNEL</span><span>RSI↑</span><span>OPTIONS</span><span>BRIEF</span>
      </div>
      {sorted.map((c, i) => {
        const isExpanded = expanded === i
        const isGrayed = c.data_quality === 'price_only'
        const channelPct = c.channel_proximity_pct != null ? Math.round(c.channel_proximity_pct * 100) : null
        const channelColor = channelPct != null ? (channelPct < 15 ? 'var(--green)' : channelPct < 25 ? 'var(--accent)' : 'var(--muted)') : 'var(--muted)'
        const rsiColor = (c.rsi_slope ?? 0) > 0 ? 'var(--green)' : 'var(--muted)'

        return (
          <div key={c.symbol}>
            <div
              onClick={() => setExpanded(isExpanded ? null : i)}
              style={{
                display: 'grid', gridTemplateColumns: COL, gap: '0 12px',
                padding: '9px 8px', fontSize: 13, cursor: 'pointer', borderRadius: isExpanded ? '4px 4px 0 0' : 4,
                background: isExpanded ? 'var(--surface2)' : 'transparent',
                borderBottom: isExpanded ? 'none' : '1px solid var(--border2)',
                alignItems: 'center', opacity: isGrayed ? 0.5 : 1,
              }}
            >
              <span style={{ fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {c.symbol}
                {c.setup_type && SETUP_COLORS[c.setup_type] && (
                  <span
                    title={`${SETUP_LABELS[c.setup_type]}: ${c.setup_type === 'pullback_uptrend' ? 'rising channel + pullback to lower band' : c.setup_type === 'base_breakout' ? 'tight range with close near top' : c.setup_type === 'oversold_bounce' ? 'RSI reached <30 and turning up' : 'range-bound stock near range low'}. Setup score: ${c.setup_score}/60`}
                    style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                      padding: '1px 5px', borderRadius: 3,
                      background: SETUP_COLORS[c.setup_type].bg,
                      color:      SETUP_COLORS[c.setup_type].fg,
                      border: `1px solid ${SETUP_COLORS[c.setup_type].bd}`,
                    }}
                  >
                    {SETUP_SHORT[c.setup_type] || c.setup_type.toUpperCase()}
                  </span>
                )}
                {c.bull_pattern && (
                  <span
                    title={`Bullish reversal pattern in last 2 bars: ${c.bull_pattern.replace(/_/g, ' ')}`}
                    style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                      padding: '1px 5px', borderRadius: 3,
                      background: 'rgba(63,185,80,0.15)',
                      color: 'var(--green)',
                      border: '1px solid rgba(63,185,80,0.35)',
                    }}
                  >
                    {c.bull_pattern === 'hammer' ? '🔨' : c.bull_pattern === 'bullish_engulfing' ? '⬆' : '⇑'}
                  </span>
                )}
                {c.vol_52w_pct_rank != null && c.vol_52w_pct_rank >= 80 && (
                  <span
                    title={`Today's volume is in the ${Math.round(c.vol_52w_pct_rank)}th percentile of the last 52 weeks. 52w peak: ${c.vol_52w_max_date || '—'}`}
                    style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                      padding: '1px 5px', borderRadius: 3,
                      background: c.vol_52w_pct_rank >= 95 ? 'rgba(63,185,80,0.18)' : 'rgba(88,166,255,0.15)',
                      color:      c.vol_52w_pct_rank >= 95 ? 'var(--green)'         : 'var(--accent)',
                      border: `1px solid ${c.vol_52w_pct_rank >= 95 ? 'rgba(63,185,80,0.4)' : 'rgba(88,166,255,0.35)'}`,
                    }}
                  >
                    VOL {Math.round(c.vol_52w_pct_rank)}%
                  </span>
                )}
              </span>
              <span
                style={{ position: 'relative', fontWeight: 700, color: scoreColor(c.score ?? 0), cursor: c.score_breakdown ? 'help' : 'default' }}
                onMouseEnter={() => c.score_breakdown && setHoveredScore(i)}
                onMouseLeave={() => setHoveredScore(null)}
              >
                {c.score ?? '—'}
                {hoveredScore === i && <ScoreTooltip breakdown={c.score_breakdown} />}
              </span>
              <span style={{ fontSize: 12, color: channelColor }}>
                {channelPct != null ? `▼${channelPct}% low` : '—'}
              </span>
              <span style={{ fontSize: 12, color: rsiColor }}>
                {c.rsi_slope != null ? ((c.rsi_slope > 0 ? '+' : '') + c.rsi_slope.toFixed(2)) : '—'}
              </span>
              <span style={{ fontSize: 13 }}>
                <span style={{ color: QUALITY_COLOR[c.data_quality] }}>{QUALITY_DOT[c.data_quality] ?? '○'}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 5 }}>
                  {c.data_quality === 'complete' ? 'complete' : c.data_quality === 'partial' ? 'partial' : 'price only'}
                </span>
              </span>
              <span style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.setup_brief ? (c.setup_brief.length > 60 ? c.setup_brief.slice(0, 60) + '…' : c.setup_brief) : '—'}
              </span>
            </div>
            {isExpanded && (
              <ExpandedRow c={c} logged={logged} onLog={handleLog} onDismiss={() => setExpanded(null)} />
            )}
          </div>
        )
      })}
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
