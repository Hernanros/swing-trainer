import React from 'react'

export default function Login() {
  return (
    <div className="onboarding">
      <h1>SwingTrainer</h1>
      <h2>Sign in to continue</h2>
      <a href="/auth/login" className="onb-btn">
        Sign in with Google
      </a>
    </div>
  )
}
