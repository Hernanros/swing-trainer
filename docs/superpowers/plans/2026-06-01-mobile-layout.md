# Mobile Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Swing Trainer PWA fully usable on a phone using a single CSS breakpoint at 640px and a new BottomNav component.

**Architecture:** Pure CSS media queries drive all layout changes — no duplicate components. One new `BottomNav.jsx` replaces the sidebar on mobile. `App.jsx` renders both; CSS controls which is visible. Watchlist and Journal get minimal JS changes (expand state, className) to support mobile-friendly interaction. No backend changes.

**Tech Stack:** React + Vite, CSS media queries, React Router NavLink.

---

## File Map

| File | Change |
|---|---|
| `frontend/src/components/BottomNav.jsx` | **Create** — 5-tab bar + More bottom sheet |
| `frontend/src/App.jsx` | Import and render `BottomNav` alongside `Sidebar` |
| `frontend/src/styles/globals.css` | Add bottom-nav base styles + `@media (max-width: 640px)` block |
| `frontend/src/pages/Watchlist.jsx` | Add `expandedRow` state, row click handler, `wl-mobile-detail` div |
| `frontend/src/pages/Journal.jsx` | Add `className="journal-table"` to `<table>` |
| `frontend/src/components/TradeDrawer.jsx` | Add `className="trade-drawer"` to inner drawer div |

---

## Task 1: BottomNav component + App integration

**Files:**
- Create: `frontend/src/components/BottomNav.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create `frontend/src/components/BottomNav.jsx`**

```jsx
import React, { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'

const PRIMARY = [
  { to: '/',          icon: '🏠', label: 'Home',      exact: true },
  { to: '/train',     icon: '🎯', label: 'Train' },
  { to: '/journal',   icon: '📓', label: 'Journal' },
  { to: '/watchlist', icon: '👁️', label: 'Watchlist' },
]

const MORE = [
  { to: '/progress',   icon: '📈', label: 'Progress' },
  { to: '/tips',       icon: '💡', label: 'Tips' },
  { to: '/playbook',   icon: '📋', label: 'Playbook' },
  { to: '/curriculum', icon: '📚', label: 'Curriculum' },
]

export default function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const [analysisBadge, setAnalysisBadge] = useState(
    () => sessionStorage.getItem('analysis_available') === '1'
  )

  useEffect(() => {
    function onBadge() { setAnalysisBadge(true) }
    window.addEventListener('analysis-badge', onBadge)
    return () => window.removeEventListener('analysis-badge', onBadge)
  }, [])

  useEffect(() => {
    if (location.pathname === '/progress') {
      sessionStorage.removeItem('analysis_available')
      setAnalysisBadge(false)
    }
    setMoreOpen(false)
  }, [location.pathname])

  function goTo(to) {
    setMoreOpen(false)
    navigate(to)
  }

  return (
    <>
      {moreOpen && (
        <div className="bottom-nav-backdrop" onClick={() => setMoreOpen(false)} />
      )}
      {moreOpen && (
        <div className="bottom-nav-more-sheet">
          <div className="bottom-nav-more-handle" />
          {MORE.map(item => (
            <button key={item.to} className="bottom-nav-more-item" onClick={() => goTo(item.to)}>
              <span>{item.icon}</span>
              <span>{item.label}</span>
              {item.to === '/progress' && analysisBadge && (
                <span className="bottom-nav-badge" />
              )}
            </button>
          ))}
        </div>
      )}
      <nav className="bottom-nav">
        {PRIMARY.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
          >
            <span className="bottom-nav-icon">{item.icon}</span>
            <span className="bottom-nav-label">{item.label}</span>
          </NavLink>
        ))}
        <button
          className={`bottom-nav-item${moreOpen ? ' active' : ''}`}
          onClick={() => setMoreOpen(o => !o)}
        >
          <span className="bottom-nav-icon">⋯</span>
          <span className="bottom-nav-label">More</span>
        </button>
      </nav>
    </>
  )
}
```

- [ ] **Step 2: Add `BottomNav` to `frontend/src/App.jsx`**

Replace the entire file with:

```jsx
import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { UserProvider, useUser } from './context/UserContext'
import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
import Onboarding from './components/Onboarding'
import Login from './components/Login'
import Home from './pages/Home'
import Train from './pages/Train'
import Journal from './pages/Journal'
import Playbook from './pages/Playbook'
import Watchlist from './pages/Watchlist'
import Progress from './pages/Progress'
import Tips from './pages/Tips'
import Curriculum from './pages/Curriculum'

function AppShell() {
  const { user, loading, authRequired } = useUser()

  if (loading)      return <div className="loading">Loading…</div>
  if (authRequired) return <Login />
  if (!user)        return <Onboarding />

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/"          element={<Home />} />
          <Route path="/train"     element={<Train />} />
          <Route path="/journal/*" element={<Journal />} />
          <Route path="/playbook"  element={<Playbook />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/progress"  element={<Progress />} />
          <Route path="/tips"       element={<Tips />} />
          <Route path="/curriculum" element={<Curriculum />} />
          <Route path="*"          element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}

export default function App() {
  return (
    <UserProvider>
      <AppShell />
    </UserProvider>
  )
}
```

- [ ] **Step 3: Build to verify no compile errors**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend" && npm run build 2>&1 | tail -6
```

Expected: `✓ built` with no errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
git add frontend/src/components/BottomNav.jsx frontend/src/App.jsx
git commit -m "feat: add BottomNav component and wire into App"
```

---

## Task 2: Core mobile CSS

**Files:**
- Modify: `frontend/src/styles/globals.css`

- [ ] **Step 1: Append bottom-nav base styles and the mobile media query block to `frontend/src/styles/globals.css`**

Add at the very end of the file:

```css
/* ── Bottom nav (hidden on desktop, shown on mobile) ── */
.bottom-nav {
  display: none;
  position: fixed;
  bottom: 0; left: 0; right: 0;
  height: 60px;
  background: var(--surface);
  border-top: 1px solid var(--border);
  z-index: 200;
  align-items: stretch;
}
.bottom-nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--muted);
  text-decoration: none;
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px 4px;
  position: relative;
  font-family: var(--font);
}
.bottom-nav-item.active { color: var(--accent); }
.bottom-nav-icon { font-size: 18px; line-height: 1; }
.bottom-nav-label { font-size: 10px; color: inherit; }
.bottom-nav-badge {
  position: absolute;
  top: 6px;
  right: calc(50% - 14px);
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--red);
}
.bottom-nav-backdrop {
  position: fixed;
  inset: 0;
  z-index: 199;
}
.bottom-nav-more-sheet {
  position: fixed;
  bottom: 60px; left: 0; right: 0;
  background: var(--surface);
  border-top: 1px solid var(--border);
  border-radius: 16px 16px 0 0;
  z-index: 200;
  padding: 0 0 16px;
}
.bottom-nav-more-handle {
  width: 32px; height: 4px;
  background: var(--border2);
  border-radius: 2px;
  margin: 10px auto 14px;
}
.bottom-nav-more-item {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px 24px;
  background: none;
  border: none;
  border-bottom: 1px solid var(--border);
  color: var(--text);
  font-size: 15px;
  font-family: var(--font);
  cursor: pointer;
  text-align: left;
  position: relative;
}
.bottom-nav-more-item:last-child { border-bottom: none; }
.bottom-nav-more-item:active { background: var(--surface2); }

/* ── Mobile (≤ 640px) ── */
@media (max-width: 640px) {
  /* App shell */
  .app-shell { max-width: 100%; }
  .sidebar { display: none; }
  .bottom-nav { display: flex; }
  .main-content { padding-bottom: 64px; }

  /* Page layout */
  .page { padding: 16px; gap: 16px; }
  .grid-2 { grid-template-columns: 1fr; }
  .stat-tiles { grid-template-columns: 1fr 1fr; gap: 10px; }
  .stat-tile-value { font-size: 1.15em; }

  /* Touch targets */
  .btn-primary { min-height: 44px; }
  .btn-sm { min-height: 36px; }

  /* Prevent iOS auto-zoom on focus */
  input, select, textarea { font-size: 16px !important; }

  /* Chart modal — full height on mobile */
  .modal-backdrop { padding: 0; align-items: flex-end; }
  .modal-box { max-height: 92dvh; border-radius: 12px 12px 0 0; }

  /* Watchlist add form — notes wraps to second line */
  .wl-add-form { flex-wrap: wrap; }
  .wl-input-notes { width: 100%; }
}
```

- [ ] **Step 2: Build to verify**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend" && npm run build 2>&1 | tail -6
```

Expected: `✓ built` with no errors.

- [ ] **Step 3: Manual test — open a narrow viewport**

Start the dev server:

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer" && uvicorn backend.main:app --reload --port 8000 &
cd frontend && npm run dev
```

Open `http://localhost:5173` and use browser DevTools to set viewport to 390px wide (iPhone size). Verify:
- Sidebar is gone
- Bottom nav bar appears with 5 tabs: Home, Train, Journal, Watchlist, More
- Tapping More slides up a sheet with Progress, Tips, Playbook, Curriculum
- All 8 pages are reachable
- At 1200px desktop the bottom nav is hidden and sidebar is visible

- [ ] **Step 4: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
git add frontend/src/styles/globals.css
git commit -m "feat: core mobile CSS — bottom nav, layout, touch targets"
```

---

## Task 3: Watchlist mobile layout

**Files:**
- Modify: `frontend/src/pages/Watchlist.jsx`
- Modify: `frontend/src/styles/globals.css`

- [ ] **Step 1: Add `expandedRow` state and row click handler to `frontend/src/pages/Watchlist.jsx`**

Add `expandedRow` to the existing state declarations (after the `tagEditId` line, around line 81):

```jsx
const [expandedRow, setExpandedRow] = useState(null)
```

Add this handler function after the `toggleTag` function (before the `if (loading)` check):

```jsx
function handleRowClick(e, itemId) {
  if (e.target.closest('button') || e.target.closest('input')) return
  setExpandedRow(prev => prev === itemId ? null : itemId)
}
```

- [ ] **Step 2: Update the `.wl-row` div and add `wl-mobile-detail` inside it**

Find the `.wl-row` div opening tag (around line 183):
```jsx
<div className="wl-row" key={item.id} style={{ position: 'relative' }}>
```

Replace it with:
```jsx
<div
  className={`wl-row${expandedRow === item.id ? ' expanded' : ''}`}
  key={item.id}
  style={{ position: 'relative' }}
  onClick={e => handleRowClick(e, item.id)}
>
```

Then add the `wl-mobile-detail` div **just before** the closing `</div>` of the `wl-row` (after the `wl-tags-row` div, around line 252):

```jsx
              {expandedRow === item.id && (
                <div className="wl-mobile-detail">
                  <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: '0.72em', color: 'var(--muted)', marginBottom: 3 }}>Earnings</div>
                      <EarningsCell symbol={item.symbol} />
                    </div>
                    {item.notes && (
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.72em', color: 'var(--muted)', marginBottom: 3 }}>Notes</div>
                        <div style={{ fontSize: '0.82em', color: 'var(--text2)' }}>{item.notes}</div>
                      </div>
                    )}
                  </div>
                  <button
                    className="btn-primary"
                    style={{ width: '100%' }}
                    onClick={e => { e.stopPropagation(); navigate('/journal', { state: { prefill: { symbol: item.symbol } } }) }}
                  >
                    Trade →
                  </button>
                </div>
              )}
```

- [ ] **Step 3: Add Watchlist mobile CSS to `globals.css`**

Two separate edits:

**Edit 1** — add the base rule in the Watchlist section (right after `.wl-actions { text-align: right; }`, outside the media query):

```css
.wl-mobile-detail { display: none; }
```

**Edit 2** — inside the existing `@media (max-width: 640px)` block (before its closing `}`), add:

```css
  /* Watchlist — 3-column mobile grid: symbol | price/change | delete */
  .wl-header { grid-template-columns: 1fr auto 40px; }
  .wl-header span:nth-child(3),
  .wl-header span:nth-child(4),
  .wl-header span:nth-child(5) { display: none; }

  .wl-row { grid-template-columns: 1fr auto 40px; cursor: pointer; }
  .wl-row > span:nth-child(3),
  .wl-row > span:nth-child(4),
  .wl-row > span:nth-child(5) { display: none; }

  .wl-row.expanded .wl-mobile-detail { display: block; }
  .wl-mobile-detail { grid-column: 1 / -1; padding: 10px 0 4px; border-top: 1px solid var(--border); }
```

- [ ] **Step 4: Build to verify**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend" && npm run build 2>&1 | tail -6
```

Expected: `✓ built` with no errors.

- [ ] **Step 5: Manual test**

At 390px viewport width, open Watchlist. Verify:
- Table shows 3 columns: Symbol · Price/Change · Delete
- Earnings, Notes, Trade→ columns are hidden
- Tapping on a row (not a button) reveals the detail panel below it with earnings, notes (if set), and Trade→ button
- Tapping the row again collapses it
- Delete button still works (no accidental expand)
- Tapping Trade→ in the expanded detail navigates to Journal with prefill

- [ ] **Step 6: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
git add frontend/src/pages/Watchlist.jsx frontend/src/styles/globals.css
git commit -m "feat: Watchlist mobile 3-column layout with tap-to-expand detail"
```

---

## Task 4: Journal mobile layout

**Files:**
- Modify: `frontend/src/pages/Journal.jsx`
- Modify: `frontend/src/styles/globals.css`

Journal table columns: (1) Date · (2) Symbol · (3) Dir · (4) Entry · (5) Exit · (6) P&L · (7) R · (8) Status · (9) action

On mobile: show Date(1), Symbol(2), P&L(6), Status(8), action(9). Hide: Dir(3), Entry(4), Exit(5), R(7).

- [ ] **Step 1: Add `className="journal-table"` to the `<table>` element in `frontend/src/pages/Journal.jsx`**

Find (around line 92):
```jsx
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
```

Replace with:
```jsx
          <table className="journal-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
```

- [ ] **Step 2: Add Journal mobile CSS to the `@media (max-width: 640px)` block in `globals.css`**

Inside the existing `@media (max-width: 640px)` block, add:

```css
  /* Journal table — hide Dir, Entry, Exit, R columns */
  .journal-table th:nth-child(3),
  .journal-table td:nth-child(3),
  .journal-table th:nth-child(4),
  .journal-table td:nth-child(4),
  .journal-table th:nth-child(5),
  .journal-table td:nth-child(5),
  .journal-table th:nth-child(7),
  .journal-table td:nth-child(7) { display: none; }
```

- [ ] **Step 3: Build to verify**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend" && npm run build 2>&1 | tail -6
```

Expected: `✓ built` with no errors.

- [ ] **Step 4: Manual test**

At 390px viewport width, open Journal. Verify:
- Table shows: Date · Symbol · P&L · Status · (Close button)
- Dir, Entry, Exit, R columns are hidden
- Tapping a closed trade row still expands the historical chart + AI debrief
- "+ New Trade" button is tappable (≥44px height)
- TradeDrawer opens when "+ New Trade" is tapped (will be full-screen after Task 5)

- [ ] **Step 5: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
git add frontend/src/pages/Journal.jsx frontend/src/styles/globals.css
git commit -m "feat: Journal mobile table — hide low-priority columns"
```

---

## Task 5: TradeDrawer full-screen on mobile

**Files:**
- Modify: `frontend/src/components/TradeDrawer.jsx`
- Modify: `frontend/src/styles/globals.css`

The TradeDrawer is currently a fixed right-side panel (300px wide, `top:0; right:0; bottom:0`). On mobile it becomes a full-screen overlay.

- [ ] **Step 1: Add `className="trade-drawer"` to the inner panel div in `frontend/src/components/TradeDrawer.jsx`**

Find (around line 167):
```jsx
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 300,
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        zIndex: 100, overflowY: 'auto', padding: 20,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
```

Replace with:
```jsx
      <div className="trade-drawer" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 300,
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        zIndex: 100, overflowY: 'auto', padding: 20,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
```

- [ ] **Step 2: Add TradeDrawer mobile CSS to the `@media (max-width: 640px)` block in `globals.css`**

Inside the existing `@media (max-width: 640px)` block, add:

```css
  /* TradeDrawer — full-screen bottom sheet on mobile */
  .trade-drawer {
    top: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    left: 0 !important;
    width: 100% !important;
    border-left: none !important;
    z-index: 300 !important;
  }
```

- [ ] **Step 3: Build to verify**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend" && npm run build 2>&1 | tail -6
```

Expected: `✓ built` with no errors.

- [ ] **Step 4: Manual test**

At 390px viewport width, tap "+ New Trade" in Journal. Verify:
- Drawer covers the full screen (no sidebar sliver visible)
- All form fields are visible and usable
- iOS: tapping an input does NOT zoom the page (font-size 16px from Task 2 CSS)
- Close button (×) is reachable at the top
- Scrolling down reveals all form fields and the submit button
- Submitting and closing returns to Journal

- [ ] **Step 5: Commit**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
git add frontend/src/components/TradeDrawer.jsx frontend/src/styles/globals.css
git commit -m "feat: TradeDrawer full-screen on mobile"
```

---

## Task 6: Build dist and deploy

- [ ] **Step 1: Build final frontend bundle**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer/frontend" && npm run build 2>&1 | tail -6
```

Expected: `✓ built` with no errors.

- [ ] **Step 2: Commit dist and deploy to Railway**

```bash
cd "/Users/hernanrosenblum/Documents/mac migration/swing-trainer"
git add frontend/dist
git commit -m "chore: rebuild dist for mobile layout deploy"
railway up --detach
```

- [ ] **Step 3: Verify on live URL**

Open `https://swing-trainer-production-167e.up.railway.app` on a phone. Verify:
- Bottom nav appears at the bottom of the screen
- Home, Train, Journal, Watchlist tabs navigate correctly
- More sheet opens with Progress, Tips, Playbook, Curriculum
- Train page — quiz loads and is playable
- Journal — "+ New Trade" opens a full-screen drawer
- Watchlist — 3-column table, tap a row to expand detail
