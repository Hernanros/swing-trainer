import React from 'react'
import { useUser } from '../context/UserContext'

const PHASE_LABEL = {
  'pre-market': 'Pre-market',
  'market':     'Market Hours',
  'post-market':'Post-market',
}

function getPhase(now) {
  const h = now.getHours()
  const m = now.getMinutes()
  if (h < 9 || (h === 9 && m < 30)) return 'pre-market'
  if (h < 16) return 'market'
  return 'post-market'
}

export default function Home() {
  const { user } = useUser()
  const now = new Date()
  const h = now.getHours()
  const greeting = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
  const phase = getPhase(now)
  const level = 1  // Phase 3 will compute from real skill scores; LEVEL_NAMES will live here too

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="greeting">Good {greeting}, {user.name}</div>
          <div className="phase-label">{PHASE_LABEL[phase]}</div>
        </div>
        <div className="level-badge">Level {level} · Beginner</div>
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
