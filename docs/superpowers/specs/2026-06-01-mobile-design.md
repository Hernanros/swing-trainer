# Mobile Layout — Design Spec
_2026-06-01_

## Goal

Make the Swing Trainer PWA fully usable on a phone. All 8 pages work on mobile. No backend changes, no duplicate components — a single CSS breakpoint at 640px drives everything.

---

## Approach

Pure CSS media queries (Option A). One `@media (max-width: 640px)` block in `globals.css` handles all layout switches. The component tree is unchanged except for one new component (`BottomNav.jsx`) and small modifications to `App.jsx`, `Watchlist.jsx`, `Journal.jsx`, and `TradeDrawer.jsx`.

---

## Navigation

**Desktop (unchanged):** 200px left sidebar with all 8 nav links.

**Mobile:** Sidebar hidden via CSS. A new `BottomNav.jsx` component renders a fixed bottom tab bar with 5 slots:

| Slot | Page |
|---|---|
| 🏠 Home | `/` |
| 🎯 Train | `/train` |
| 📓 Journal | `/journal` |
| 👁️ Watchlist | `/watchlist` |
| ⋯ More | — opens More sheet |

Tapping ⋯ opens a bottom sheet (slide-up overlay) listing the four overflow pages: Progress, Tips, Playbook, Curriculum. Tapping any item navigates and closes the sheet.

The analysis-available red dot badge (currently on the Progress sidebar link) moves to the Progress row inside the More sheet on mobile.

`BottomNav.jsx` is rendered in `App.jsx` alongside `Sidebar`. CSS controls which one is visible at any breakpoint.

`.main-content` gets `padding-bottom: 64px` on mobile so page content is never hidden behind the tab bar.

---

## Watchlist

The current 6-column grid (Symbol · Price · Change · Earnings · Tags · Trade→) is replaced on mobile with a compact 3-column table:

```
Symbol   Price    Chg    ›
AAPL     $187.42  +2.3%  ›
NVDA     $875.10  -1.1%  ›
```

Tapping the `›` chevron or anywhere on the row expands an inline detail panel showing: earnings badge, tags, and the Trade → button. The expand/collapse is handled in `Watchlist.jsx` with a `expandedRow` state (integer index or null). Only one row expanded at a time.

CSS class `.wl-mobile-row` replaces `.wl-header` grid on mobile.

---

## Journal

The trade table collapses to 3 columns on mobile: Symbol · P&L · Date. The existing tap-to-expand behaviour (expandable rows with historical chart and AI debrief) already works — this is purely a CSS fix to make the collapsed row readable at narrow width.

---

## TradeDrawer

On desktop the drawer is a wide right-side panel. On mobile it becomes a full-screen bottom sheet:

- Slides up from the bottom, covering the full viewport
- Scrollable content area
- Close button pinned at the top right
- Submit/save button pinned at the bottom so it is always reachable without scrolling
- All `<input>` and `<select>` fields get `font-size: 16px` to prevent iOS auto-zoom on focus

Implemented with a CSS class toggle: `.trade-drawer` gets `position: fixed; inset: 0; border-radius: 0` on mobile instead of the desktop slide-in style.

---

## General Layout Fixes (all pages)

| Rule | Desktop | Mobile |
|---|---|---|
| `.page` padding | 24px | 16px |
| `.grid-2` | 2 columns | 1 column |
| `.app-shell` max-width | 1200px centered | full width |
| Button/tap targets | default | `min-height: 44px` |
| `<input>`, `<select>` font-size | 14px | 16px (prevents iOS zoom) |
| `ChartModal` height | auto | `max-height: 100dvh` |

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/components/BottomNav.jsx` | New — 5-tab bar + More bottom sheet |
| `frontend/src/App.jsx` | Render `BottomNav` alongside `Sidebar` |
| `frontend/src/styles/globals.css` | `@media (max-width: 640px)` block |
| `frontend/src/pages/Watchlist.jsx` | `expandedRow` state + mobile grid CSS class |
| `frontend/src/pages/Journal.jsx` | Mobile grid CSS class on collapsed row |
| `frontend/src/components/TradeDrawer.jsx` | Full-screen bottom sheet on mobile + 16px inputs |

---

## Out of Scope

- Tablet / iPad breakpoint (can be added later)
- Swipe gestures for navigation
- Pull-to-refresh
- Native push notifications
