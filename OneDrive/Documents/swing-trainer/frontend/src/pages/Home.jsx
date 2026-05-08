import React from 'react'
import { useUser } from '../context/UserContext'

function getPhase() {
  const now = new Date()
  const h = now.getHours()
  const m = now.getMinutes()
  if (h < 9 || (h === 9 && m < 30)) return 'pre-market'
  if (h < 16) return 'market'
  return 'post-market'
}

const PHASE_LABEL = {
  'pre-market': 'Pre-market',
  'market':     'Market Hours',
  'post-market':'Post-market',
}

const LEVEL_NAMES = ['Beginner', 'Building Edge', 'Developing Edge', 'Consistent Trader', 'Skilled Trader']

function overallLevel(skills) {
  if (!skills || skills.length === 0) return 1
  const avg = skills.reduce((s, x) => s + x.score, 0) / skills.length
  if (avg < 25) return 1
  if (avg < 45) return 2
  if (avg < 65) return 3
  if (avg < 85) return 4
  return 5
}

export default function Home() {
  const { user } = useUser()
  const h = new Date().getHours()
  const greeting = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
  const phase = getPhase()
  const level = 1  // Phase 3 will compute from real skill scores

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="greeting">Good {greeting}, {user.name}</div>
          <div className="phase-label">{PHASE_LABEL[phase]}</div>
        </div>
        <div className="level-badge">Level {level} · {LEVEL_NAMES[level - 1]}</div>
      </div>

      <div className="placeholder-card">
        <strong>Today's Training Session</strong>
        <p style={{marginTop:8}}>Drills coming in Phase 3.</p>
      </div>

      <div className="grid-2">
        <div className="placeholder-card">
          <strong>Skill Progress</strong>
          <p style={{marginTop:8}}>Charts coming in Phase 3.</p>
        </div>
        <div className="placeholder-card">
          <strong>Open Positions</strong>
          <p style={{marginTop:8}}>Trade tracking coming in Phase 2.</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="placeholder-card">
          <strong>Training Streak</strong>
          <p style={{marginTop:8}}>Coming in Phase 3.</p>
        </div>
        <div className="placeholder-card">
          <strong>This Week's Edge</strong>
          <p style={{marginTop:8}}>Stats coming in Phase 2.</p>
        </div>
      </div>
    </div>
  )
}
