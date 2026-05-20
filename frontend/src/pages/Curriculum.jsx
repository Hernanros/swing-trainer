import React, { useEffect, useState } from 'react'
import { api } from '../api'

const CURRICULUM = [
  {
    skill: 'setup_selection', label: 'Setup Selection',
    items: [
      { id: 'ss_1', text: 'Understand the 3 core base patterns: cup-with-handle, flat base, VCP (volatility contraction)' },
      { id: 'ss_2', text: 'Identify relative strength vs the S&P 500 using the RS line on a weekly chart' },
      { id: 'ss_3', text: 'Confirm breakout with volume: 40%+ above average on the breakout day' },
      { id: 'ss_4', text: 'Filter for Stage 2 uptrends: price above 50-day and 200-day moving averages, both sloping up' },
      { id: 'ss_5', text: 'Focus on leading sectors — trade the top 1-2 leaders, ignore laggards' },
    ],
  },
  {
    skill: 'entry_timing', label: 'Entry Timing',
    items: [
      { id: 'et_1', text: 'Define the exact pivot point before entry: high of handle or top of tight base' },
      { id: 'et_2', text: 'Buy at or within 5% of the pivot — never chase extended entries' },
      { id: 'et_3', text: 'Use the 10-minute or 15-minute chart to time intraday entries precisely' },
      { id: 'et_4', text: 'Confirm market direction with a follow-through day (FTD) before entering new positions' },
      { id: 'et_5', text: 'Avoid buying into overhead resistance — check for prior distribution areas on the weekly chart' },
    ],
  },
  {
    skill: 'risk_sizing', label: 'Risk Sizing',
    items: [
      { id: 'rs_1', text: 'Position size formula: shares = (account × risk%) ÷ (entry − stop)' },
      { id: 'rs_2', text: 'Set initial stop at 7–8% below entry or structurally below the base low' },
      { id: 'rs_3', text: 'Never risk more than 1–2% of total account on any single trade' },
      { id: 'rs_4', text: 'Track total portfolio heat: sum of all open risk should stay below 6–8% of account' },
      { id: 'rs_5', text: 'Pyramiding rule: buy 50% at pivot, add 25% on first pullback to 10-day MA, rest if extended' },
    ],
  },
  {
    skill: 'trade_management', label: 'Trade Management',
    items: [
      { id: 'tm_1', text: 'Cut losses automatically at 7–8% below purchase price — no exceptions, no averaging down' },
      { id: 'tm_2', text: 'Take partial profits (25–30% of position) once the stock is up 20–25%' },
      { id: 'tm_3', text: 'Apply the 8-week hold rule: if a stock surges 20%+ in 3 weeks, hold for 8 weeks total' },
      { id: 'tm_4', text: 'Raise stop to breakeven once the trade is profitable by 1R' },
      { id: 'tm_5', text: 'Recognize sell signals: climax run, gap-up to new high on volume after a long advance' },
    ],
  },
  {
    skill: 'emotional_discipline', label: 'Emotional Discipline',
    items: [
      { id: 'ed_1', text: 'Write a pre-trade note before every entry: setup rationale, stop, target, risk $' },
      { id: 'ed_2', text: 'Never average down on a losing position — adding to a loser compounds risk' },
      { id: 'ed_3', text: 'Rule of 3: stop trading for the day after 3 consecutive losses' },
      { id: 'ed_4', text: 'Conduct a weekly review: go through every trade — what worked, what failed, and why' },
      { id: 'ed_5', text: 'Assess market conditions every morning before trading (uptrend / correction / distribution)' },
    ],
  },
  {
    skill: 'chart_reading', label: 'Chart Reading',
    items: [
      { id: 'cr_1', text: 'Read volume patterns: rising price + rising volume = accumulation (bullish signal)' },
      { id: 'cr_2', text: 'Use the 50-day MA as dynamic support — healthy stocks bounce off it, weak ones slice through' },
      { id: 'cr_3', text: 'Count distribution days on the index: 5–6 in a few weeks often signals a market top' },
      { id: 'cr_4', text: 'Spot tight price action: weeks of very small ranges = institutional accumulation in progress' },
      { id: 'cr_5', text: 'Use the weekly chart as primary timeframe for setup identification; daily for entry precision' },
    ],
  },
]

export default function Curriculum() {
  const [checked, setChecked] = useState(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.curriculum.list()
      .then(ids => setChecked(new Set(ids)))
      .finally(() => setLoading(false))
  }, [])

  async function toggle(id) {
    const next = new Set(checked)
    if (next.has(id)) {
      next.delete(id)
      setChecked(next)
      await api.curriculum.uncheck(id)
    } else {
      next.add(id)
      setChecked(next)
      await api.curriculum.check(id)
    }
  }

  const total = CURRICULUM.reduce((s, g) => s + g.items.length, 0)
  const done  = checked.size

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="greeting">Curriculum</div>
          <div className="phase-label">Your swing trading learning path</div>
        </div>
        <div className="level-badge">{done} / {total} complete</div>
      </div>

      {/* Overall progress bar */}
      <div className="curr-progress-bar-track">
        <div className="curr-progress-bar-fill" style={{ width: `${(done / total) * 100}%` }} />
      </div>

      {loading ? (
        <div className="muted">Loading…</div>
      ) : (
        CURRICULUM.map(group => {
          const groupDone = group.items.filter(i => checked.has(i.id)).length
          return (
            <div className="curr-section" key={group.skill}>
              <div className="curr-section-header">
                <span className="curr-section-title">{group.label}</span>
                <span className="curr-section-count">{groupDone}/{group.items.length}</span>
              </div>
              <div className="curr-items">
                {group.items.map(item => (
                  <label key={item.id} className={`curr-item${checked.has(item.id) ? ' checked' : ''}`}>
                    <input
                      type="checkbox"
                      className="curr-checkbox"
                      checked={checked.has(item.id)}
                      onChange={() => toggle(item.id)}
                    />
                    <span className="curr-item-text">{item.text}</span>
                  </label>
                ))}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
