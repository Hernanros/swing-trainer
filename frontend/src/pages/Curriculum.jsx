import React, { useEffect, useState } from 'react'
import { api } from '../api'
import QuizDrill from '../components/drills/QuizDrill'

const CURRICULUM = [
  {
    skill: 'setup_selection', label: 'Setup Selection',
    items: [
      { id: 'ss_1', text: 'Understand the 3 core base patterns: cup-with-handle, flat base, VCP (volatility contraction)', ytQuery: 'cup with handle flat base VCP volatility contraction pattern swing trading tutorial' },
      { id: 'ss_2', text: 'Identify relative strength vs the S&P 500 using the RS line on a weekly chart', ytQuery: 'relative strength line IBD stock market swing trading tutorial' },
      { id: 'ss_3', text: 'Confirm breakout with volume: 40%+ above average on the breakout day', ytQuery: 'breakout volume confirmation swing trading 40 percent above average' },
      { id: 'ss_4', text: 'Filter for Stage 2 uptrends: price above 50-day and 200-day moving averages, both sloping up', ytQuery: 'stage 2 uptrend 50 day 200 day moving average swing trading' },
      { id: 'ss_5', text: 'Focus on leading sectors — trade the top 1-2 leaders, ignore laggards', ytQuery: 'leading sectors IBD swing trading sector rotation' },
    ],
  },
  {
    skill: 'entry_timing', label: 'Entry Timing',
    items: [
      { id: 'et_1', text: 'Define the exact pivot point before entry: high of handle or top of tight base', ytQuery: 'pivot point breakout entry swing trading handle base' },
      { id: 'et_2', text: 'Buy at or within 5% of the pivot — never chase extended entries', ytQuery: 'buying within 5 percent pivot swing trading rules extended entry' },
      { id: 'et_3', text: 'Use the 10-minute or 15-minute chart to time intraday entries precisely', ytQuery: '10 minute 15 minute chart intraday entry timing swing trading' },
      { id: 'et_4', text: 'Confirm market direction with a follow-through day (FTD) before entering new positions', ytQuery: 'follow through day FTD market bottom IBD confirmation' },
      { id: 'et_5', text: 'Avoid buying into overhead resistance — check for prior distribution areas on the weekly chart', ytQuery: 'overhead resistance weekly chart swing trading distribution' },
    ],
  },
  {
    skill: 'risk_sizing', label: 'Risk Sizing',
    items: [
      { id: 'rs_1', text: 'Position size formula: shares = (account × risk%) ÷ (entry − stop)', ytQuery: 'position sizing formula risk management trading shares calculation' },
      { id: 'rs_2', text: 'Set initial stop at 7–8% below entry or structurally below the base low', ytQuery: 'stop loss placement 7 8 percent swing trading base low' },
      { id: 'rs_3', text: 'Never risk more than 1–2% of total account on any single trade', ytQuery: '1 percent 2 percent account risk per trade position sizing rule' },
      { id: 'rs_4', text: 'Track total portfolio heat: sum of all open risk should stay below 6–8% of account', ytQuery: 'portfolio heat total open risk management swing trading' },
      { id: 'rs_5', text: 'Pyramiding rule: buy 50% at pivot, add 25% on first pullback to 10-day MA, rest if extended', ytQuery: 'pyramiding into position swing trading 10 day moving average add' },
    ],
  },
  {
    skill: 'trade_management', label: 'Trade Management',
    items: [
      { id: 'tm_1', text: 'Cut losses automatically at 7–8% below purchase price — no exceptions, no averaging down', ytQuery: 'cut losses 7 8 percent stop loss discipline trading no exceptions' },
      { id: 'tm_2', text: 'Take partial profits (25–30% of position) once the stock is up 20–25%', ytQuery: 'taking partial profits 20 25 percent swing trading sell rules' },
      { id: 'tm_3', text: 'Apply the 8-week hold rule: if a stock surges 20%+ in 3 weeks, hold for 8 weeks total', ytQuery: '8 week hold rule 20 percent surge 3 weeks swing trading IBD' },
      { id: 'tm_4', text: 'Raise stop to breakeven once the trade is profitable by 1R', ytQuery: 'raise stop to breakeven 1R risk reward trade management' },
      { id: 'tm_5', text: 'Recognize sell signals: climax run, gap-up to new high on volume after a long advance', ytQuery: 'climax run sell signals gap up volume extended swing trading' },
    ],
  },
  {
    skill: 'emotional_discipline', label: 'Emotional Discipline',
    items: [
      { id: 'ed_1', text: 'Write a pre-trade note before every entry: setup rationale, stop, target, risk $', ytQuery: 'pre trade journal note trading discipline setup rationale' },
      { id: 'ed_2', text: 'Never average down on a losing position — adding to a loser compounds risk', ytQuery: 'never average down losing position trading psychology risk' },
      { id: 'ed_3', text: 'Rule of 3: stop trading for the day after 3 consecutive losses', ytQuery: 'daily loss limit rule of 3 consecutive losses trading discipline' },
      { id: 'ed_4', text: 'Conduct a weekly review: go through every trade — what worked, what failed, and why', ytQuery: 'weekly trade review journal analysis what worked failed trading' },
      { id: 'ed_5', text: 'Assess market conditions every morning before trading (uptrend / correction / distribution)', ytQuery: 'morning market conditions assessment IBD uptrend distribution trading routine' },
    ],
  },
  {
    skill: 'chart_reading', label: 'Chart Reading',
    items: [
      { id: 'cr_1', text: 'Read volume patterns: rising price + rising volume = accumulation (bullish signal)', ytQuery: 'volume price action accumulation distribution chart reading bullish' },
      { id: 'cr_2', text: 'Use the 50-day MA as dynamic support — healthy stocks bounce off it, weak ones slice through', ytQuery: '50 day moving average dynamic support swing trading bounce' },
      { id: 'cr_3', text: 'Count distribution days on the index: 5–6 in a few weeks often signals a market top', ytQuery: 'distribution days count market top index IBD swing trading' },
      { id: 'cr_4', text: 'Spot tight price action: weeks of very small ranges = institutional accumulation in progress', ytQuery: 'tight price action VCP institutional accumulation small range chart' },
      { id: 'cr_5', text: 'Use the weekly chart as primary timeframe for setup identification; daily for entry precision', ytQuery: 'weekly chart daily chart timeframe swing trading setup identification entry' },
    ],
  },
  {
    skill: 'technical_indicators', label: 'Technical Indicators',
    items: [
      { id: 'ti_1', text: 'RSI basics: overbought above 70, oversold below 30 — but in strong trends RSI stays extended', ytQuery: 'RSI relative strength index overbought oversold swing trading tutorial' },
      { id: 'ti_2', text: 'Spot RSI divergence: price makes a new high but RSI does not — early warning of reversal', ytQuery: 'RSI divergence bearish bullish price divergence swing trading' },
      { id: 'ti_3', text: 'MACD crossovers: signal line cross above zero line = bullish momentum confirmation', ytQuery: 'MACD signal line crossover zero line momentum swing trading tutorial' },
      { id: 'ti_4', text: 'Bollinger Band squeeze: when bands contract to their tightest, a large move is imminent', ytQuery: 'bollinger band squeeze volatility contraction breakout swing trading' },
      { id: 'ti_5', text: 'VWAP as intraday anchor: price above VWAP = buyers in control; below = sellers in control', ytQuery: 'VWAP intraday support resistance swing trading day trading anchor' },
    ],
  },
  {
    skill: 'market_internals', label: 'Market Internals',
    items: [
      { id: 'mi_1', text: 'Advance/Decline line: if A/D line diverges from the index (index up, A/D flat), rally is narrowing', ytQuery: 'advance decline line breadth divergence market internals swing trading' },
      { id: 'mi_2', text: 'New highs vs new lows: a healthy bull market sees new highs expanding, not contracting', ytQuery: 'new 52 week highs lows ratio market breadth leadership swing trading' },
      { id: 'mi_3', text: 'VIX above 30 signals extreme fear — often a contrarian buy signal near market bottoms', ytQuery: 'VIX fear gauge contrarian signal market bottom swing trading' },
      { id: 'mi_4', text: 'Follow-through day: a major index up 1.25%+ on higher volume on day 4+ of a rally attempt confirms a new uptrend', ytQuery: 'follow through day IBD market uptrend confirmation rally attempt' },
      { id: 'mi_5', text: 'Sector rotation: money flows from defensive sectors (utilities, staples) to growth sectors at bull market starts', ytQuery: 'sector rotation cycle bull market growth defensive sectors swing trading' },
    ],
  },
  {
    skill: 'short_selling', label: 'Short Selling',
    items: [
      { id: 'sh_1', text: 'Only short in Stage 3 topping or Stage 4 downtrend — shorting in an uptrend is fighting the tape', ytQuery: 'stage 3 stage 4 short selling downtrend Weinstein swing trading' },
      { id: 'sh_2', text: 'Failed breakout setup: stock breaks out, then closes back below pivot within 1–2 days — short the reclose', ytQuery: 'failed breakout short setup swing trading entry signal' },
      { id: 'sh_3', text: 'Head and shoulders top: short entry is the break below the neckline on high volume', ytQuery: 'head and shoulders top neckline break short entry swing trading' },
      { id: 'sh_4', text: 'Cover rules: close the short at your stop (above the recent high) or at a 20–25% profit target', ytQuery: 'short selling cover rules stop loss profit target swing trading' },
      { id: 'sh_5', text: 'Short squeeze risk: high short interest + positive catalyst = violent short covering — check float before shorting', ytQuery: 'short squeeze risk high short interest float swing trading risk management' },
    ],
  },
  {
    skill: 'gap_trading', label: 'Gap Trading',
    items: [
      { id: 'gt_1', text: 'Classify the gap: common (fills quickly), breakaway (strong, rarely fills), continuation, exhaustion', ytQuery: 'gap types classification breakaway continuation exhaustion common swing trading' },
      { id: 'gt_2', text: 'Breakaway gaps on earnings with 3× volume rarely fill — they mark the start of a new trend leg', ytQuery: 'breakaway gap earnings volume swing trading gap and go' },
      { id: 'gt_3', text: 'Gap fill probability: exhaustion gaps fill 70%+ of the time; breakaway gaps fill less than 20%', ytQuery: 'gap fill probability statistics exhaustion breakaway swing trading' },
      { id: 'gt_4', text: 'Gap-up entry rule: if a stock gaps above your pivot, only buy if it holds above the gap open after 30 minutes', ytQuery: 'gap up entry rule pivot breakout 30 minute rule swing trading' },
      { id: 'gt_5', text: 'Pre-market volume on a gap matters: a gap with 500k+ pre-market shares is more significant than a thin gap', ytQuery: 'pre market volume gap significance swing trading earnings gap assessment' },
    ],
  },
]

export default function Curriculum() {
  const [checked, setChecked] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [drillModal, setDrillModal] = useState(null)
  const [drillQuestions, setDrillQuestions] = useState(null)
  const [drillLoading, setDrillLoading] = useState(false)
  const [drillError, setDrillError] = useState('')

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

  async function openDrill(item, skill) {
    setDrillModal({ topic: item.id, context: item.text })
    setDrillQuestions(null)
    setDrillError('')
    setDrillLoading(true)
    try {
      const { questions } = await api.train.aiDrill({ topic: item.id, context: item.text, skill: skill || null })
      // Normalize AI fields to QuizDrill's expected shape
      const normalized = questions.map(q => ({
        q: q.q,
        options: q.choices,
        correct: q.answer,
        explanation: q.explanation,
      }))
      setDrillQuestions(normalized)
    } catch (e) {
      setDrillError(e.message || 'Could not generate questions, try again')
    } finally {
      setDrillLoading(false)
    }
  }

  function closeDrill() {
    setDrillModal(null)
    setDrillQuestions(null)
    setDrillError('')
    setDrillLoading(false)
  }

  useEffect(() => {
    if (!drillModal) return
    const handler = (e) => { if (e.key === 'Escape') closeDrill() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [drillModal])

  const total = CURRICULUM.reduce((s, g) => s + g.items.length, 0)
  const done  = checked.size

  return (
    <>
    {drillModal && (
      <div className="modal-overlay" onClick={closeDrill}>
        <div className="modal-box curr-drill-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <span>Practice: {drillModal.context.length > 60 ? drillModal.context.slice(0, 60) + '…' : drillModal.context}</span>
            <button className="btn-sm btn-ghost" onClick={closeDrill}>✕</button>
          </div>
          {drillLoading && <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>Generating questions…</div>}
          {drillError && <div className="wl-error" style={{ padding: '16px' }}>{drillError}</div>}
          {drillQuestions && (
            <QuizDrill
              questions={drillQuestions}
              skill="custom"
              drillKey="ai_drill"
              onComplete={closeDrill}
            />
          )}
        </div>
      </div>
    )}
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
                    <a
                      href={`https://www.youtube.com/results?search_query=${encodeURIComponent(item.ytQuery)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="curr-yt-link"
                      onClick={e => e.stopPropagation()}
                      title="Search YouTube"
                    >▶</a>
                    <button
                      className="curr-practice-btn btn-sm btn-ghost"
                      onClick={e => { e.preventDefault(); e.stopPropagation(); openDrill(item, group.skill) }}
                      title="Generate practice questions"
                    >Practice</button>
                  </label>
                ))}
              </div>
            </div>
          )
        })
      )}
    </div>
    </>
  )
}
