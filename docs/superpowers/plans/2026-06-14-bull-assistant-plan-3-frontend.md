# Bull Assistant — Plan 3: Frontend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/bull` page with top-down layout (macro bar → sector strip → candidates table → chat), account profile modal, sidebar nav entry, and route. All UI follows the existing CSS variable palette and inline style conventions from TradeDrawer.jsx.

**Architecture:** Single new page component `Bull.jsx`. API calls go through a new `bull` namespace in `api.js`. Account profile is a modal within Bull.jsx (no separate page). Chat is a controlled textarea + message list at the bottom of the page.

**Tech Stack:** React (existing), Vite (existing), existing CSS variables (`globals.css`), lightweight-charts NOT needed (no chart on this page)

**Depends on:** Plan 2 (all `/api/bull/` endpoints live)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/api.js` | Modify | Add `bull` namespace (profile, scan, chat) |
| `frontend/src/App.jsx` | Modify | Add `/bull` route |
| `frontend/src/components/Sidebar.jsx` | Modify | Add "Bull" nav link |
| `frontend/src/pages/Bull.jsx` | Create | Full Bull Assistant page |

No new npm packages needed.

---

### Task 1: Add bull namespace to api.js

**Files:**
- Modify: `frontend/src/api.js`

- [ ] **Step 1: Read api.js to find the trades namespace to use as a pattern**

Read `frontend/src/api.js` lines 54–80 to understand the one-liner arrow-function shape and `request()` helper.

- [ ] **Step 2: Add bull namespace**

In `frontend/src/api.js`, in the `api` object, add a new `bull` namespace after the existing `trades` namespace:

```js
bull: {
  getProfile:  ()     => request('GET',  '/bull/profile'),
  putProfile:  (body) => request('PUT',  '/bull/profile', body),
  latestScan:  ()     => request('GET',  '/bull/scan/latest'),
  runScan:     ()     => request('POST', '/bull/scan/run', {}),
  chat:        (body) => request('POST', '/bull/chat', body),
},
```

Match the existing indentation. The `request()` helper already prefixes `/api`, so paths start with `/bull/`.

- [ ] **Step 3: Verify grep**

```bash
grep -c "bull" frontend/src/api.js
```

Expected: ≥ 5 (one per method + namespace key)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat(bull): add bull namespace to api.js"
```

---

### Task 2: Add /bull route to App.jsx and Bull link to Sidebar.jsx

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`

- [ ] **Step 1: Read App.jsx to find where routes are defined**

Read `frontend/src/App.jsx` — find the `<Route>` or `<Routes>` block. Note the exact import pattern for page components.

- [ ] **Step 2: Add import and route to App.jsx**

Add the import at the top alongside other page imports:
```jsx
import Bull from './pages/Bull'
```

Add the route inside the `<Routes>` block alongside other routes (e.g. after the `/progress` route):
```jsx
<Route path="/bull" element={<Bull />} />
```

- [ ] **Step 3: Read Sidebar.jsx to find nav link pattern**

Read `frontend/src/components/Sidebar.jsx` — find how existing nav links are rendered (likely `<NavLink>` or `<Link>` from react-router-dom). Note the exact className or style pattern.

- [ ] **Step 4: Add Bull nav link to Sidebar.jsx**

Add a new nav link for `/bull` alongside existing links, following the exact same pattern as the others. Use "Bull" as the label. Place it after "Progress" or at the end of the primary nav section.

Example (adjust to match existing pattern exactly):
```jsx
<NavLink to="/bull" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
  Bull
</NavLink>
```

- [ ] **Step 5: Verify**

```bash
grep -c "bull\|Bull" frontend/src/App.jsx    # expect >= 2
grep -c "bull\|Bull" frontend/src/components/Sidebar.jsx  # expect >= 1
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/Sidebar.jsx
git commit -m "feat(bull): add /bull route and sidebar nav link"
```

---

### Task 3: Create Bull.jsx — skeleton, data fetching, loading/empty states

**Files:**
- Create: `frontend/src/pages/Bull.jsx`

- [ ] **Step 1: Create Bull.jsx with skeleton and data fetch**

Create `frontend/src/pages/Bull.jsx`:

```jsx
import { useState, useEffect } from 'react'
import api from '../api'

export default function Bull() {
  const [scan, setScan] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [running, setRunning] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  // Profile form state
  const [profileForm, setProfileForm] = useState({ account_size: '', risk_per_trade_pct: 1.0, max_contracts: 5 })
  const [savingProfile, setSavingProfile] = useState(false)

  // Chat state
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
    } catch (e) {
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
      {/* Header */}
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
```

- [ ] **Step 2: Verify file exists and has no obvious syntax issues**

```bash
grep -c "export default function Bull" frontend/src/pages/Bull.jsx
```

Expected: 1

- [ ] **Step 3: Commit skeleton**

```bash
git add frontend/src/pages/Bull.jsx
git commit -m "feat(bull): add Bull.jsx skeleton with data fetch, header, and state"
```

---

### Task 4: Add sub-components to Bull.jsx

**Files:**
- Modify: `frontend/src/pages/Bull.jsx`

Add all sub-components to the same `Bull.jsx` file (keep it self-contained — each component is small).

- [ ] **Step 1: Add NoScanState component**

At the bottom of `frontend/src/pages/Bull.jsx`, after the `Bull` function, add:

```jsx
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
```

- [ ] **Step 2: Add MacroBar component**

```jsx
function MacroBar({ macro }) {
  if (!macro) return null
  const spy = macro.spy || {}
  const qqq = macro.qqq || {}
  const regimeColor = r => r === 'bullish' ? 'var(--green, #4c4)' : r === 'bearish' ? 'var(--red)' : 'var(--muted)'
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
```

- [ ] **Step 3: Add SectorStrip component**

```jsx
function SectorStrip({ sectors }) {
  if (!sectors || sectors.length === 0) return null
  const labelColor = l => l === 'strong' ? 'var(--green, #4c4)' : l === 'weak' ? 'var(--red)' : 'var(--muted)'
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
```

- [ ] **Step 4: Add CandidatesTable component**

```jsx
function CandidatesTable({ candidates }) {
  if (!candidates || candidates.length === 0) {
    return (
      <div style={{ padding: '20px 0', color: 'var(--muted)', fontSize: 13 }}>
        No setups met criteria today — market conditions may be unfavorable.
      </div>
    )
  }
  const [expanded, setExpanded] = useState(null)
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '60px 50px 70px 80px 50px 1fr', gap: '0 12px', padding: '4px 8px', fontSize: 10, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.05em', borderBottom: '1px solid var(--border2)', marginBottom: 4 }}>
        <span>TICKER</span><span>SCORE</span><span>CONTRACTS</span><span>MAX LOSS</span><span>IV</span><span>SECTOR</span>
      </div>
      {candidates.map((c, i) => (
        <div key={c.symbol}>
          <div
            onClick={() => setExpanded(expanded === i ? null : i)}
            style={{ display: 'grid', gridTemplateColumns: '60px 50px 70px 80px 50px 1fr', gap: '0 12px', padding: '8px 8px', fontSize: 13, cursor: 'pointer', borderRadius: 4, background: i === 0 ? 'var(--surface2)' : 'transparent', color: i === 0 ? 'var(--accent)' : 'var(--text2)', borderBottom: '1px solid var(--border2)' }}
          >
            <span style={{ fontWeight: i === 0 ? 700 : 400 }}>{c.symbol}</span>
            <span>{c.score?.toFixed(1)}</span>
            <span>{c.contracts ?? '—'}</span>
            <span>${c.max_loss_per_contract != null ? c.max_loss_per_contract.toLocaleString() : '—'}</span>
            <span>{c.ivr != null ? Math.round(c.ivr) + '%' : c.iv != null ? (c.iv * 100).toFixed(0) + '%' : '—'}</span>
            <span style={{ color: 'var(--muted)', fontSize: 11 }}>{c.sector || '—'} {c.sector_label === 'strong' ? '▲' : c.sector_label === 'weak' ? '▼' : '→'}</span>
          </div>
          {expanded === i && (
            <div style={{ background: 'var(--surface2)', borderRadius: 4, padding: '10px 12px', margin: '0 0 4px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
              <strong>Rationale:</strong> {c.rationale || '—'}
              <br />
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
```

- [ ] **Step 5: Add ChatPanel component**

```jsx
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
```

- [ ] **Step 6: Add ProfileModal component**

```jsx
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
              style={{ display: 'block', width: '100%', marginTop: 4, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 5, color: 'var(--text)', padding: '6px 10px', fontSize: 13 }}
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
              style={{ display: 'block', width: '100%', marginTop: 4, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 5, color: 'var(--text)', padding: '6px 10px', fontSize: 13 }}
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
              style={{ display: 'block', width: '100%', marginTop: 4, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 5, color: 'var(--text)', padding: '6px 10px', fontSize: 13 }}
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
```

- [ ] **Step 7: Build and verify**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend" && npm run build 2>&1 | tail -15
```

Expected: build exits 0 with no errors. If there are missing `useState` imports in sub-components, add `import { useState } from 'react'` at the top of Bull.jsx (the sub-components use `useState` from the same file scope).

Fix: The `CandidatesTable` uses its own `useState`. Since all components are in one file, the single `import { useState, useEffect } from 'react'` at the top covers all of them.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/Bull.jsx
git commit -m "feat(bull): add Bull.jsx sub-components (MacroBar, SectorStrip, CandidatesTable, ChatPanel, ProfileModal)"
```

---

### Task 5: Smoke test and final build

**Files:**
- None (verification only)

- [ ] **Step 1: Start backend**

```bash
DEV_BYPASS_AUTH=true python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 7432 --reload
```

- [ ] **Step 2: Start frontend**

```bash
cd frontend && npm run dev
```

- [ ] **Step 3: Verify profile flow**

- Open `http://localhost:5173`
- Click "Bull" in the sidebar — confirm the Bull Assistant page loads
- Click ⚙ Profile — confirm modal opens
- Enter: Account Size = 25000, Risk = 1, Max Contracts = 5
- Click Save — confirm modal closes, no error

- [ ] **Step 4: Verify scan flow**

- Click "Run Scan" (note: this will take time and may fail if API keys are absent — that's expected)
- If `ANTHROPIC_API_KEY` and `TWELVEDATA_API_KEY` are set: scan runs, candidates appear
- If keys absent: candidates appear with score = 0 and "[Scoring unavailable]" rationale — this is correct graceful degradation

- [ ] **Step 5: Verify empty state**

- If no scan exists yet: confirm "No scan available yet" message and "Run Scan Now" button appear
- If profile not set: confirm "Set your account profile to get started" message appears

- [ ] **Step 6: Verify chat**

- If a scan exists, type a question in the chat box: "Which sector is strongest?"
- Click Ask — confirm response appears (or "[Chat unavailable]" if no API key)

- [ ] **Step 7: Verify equity pages unbroken**

- Navigate to Journal, Watchlist, Train, Progress — confirm no regressions

- [ ] **Step 8: Production build**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend" && npm run build 2>&1 | tail -5
```

Expected: exits 0.

- [ ] **Step 9: Run full backend test suite**

```bash
pytest tests/ -x -q
```

Expected: all passing.

- [ ] **Step 10: Commit build if all clean**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && git add frontend/dist && git commit -m "build: rebuild frontend for Phase 8 Bull Assistant"
```

---

## Plan 3 Complete

All three plans complete. The Bull Assistant is fully operational:

- Daily pipeline: macro → sector → S&P 500 screener → Claude scoring → sizing → persisted scan
- Dedicated `/bull` page: macro bar, sector strip, candidates table with expandable rationale, chat
- Account profile modal: account size, risk %, max contracts saved per user
- Scheduler: 5 PM ET weekdays, skips US market holidays
- Options abstraction: yfinance default, Tradier stub ready for `TRADIER_API_KEY`

**Deploy:**
```bash
cd frontend && npm run build
cd .. && git add frontend/dist && git commit -m "build: rebuild frontend for Phase 8"
railway up --detach
```
