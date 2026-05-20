import React, { useEffect, useState } from 'react'
import { api } from '../../api'

function Explanation({ problem, result }) {
  const riskAmount = problem.account_size * problem.risk_pct / 100
  const riskPerShare = problem.entry - problem.stop

  return (
    <div className="drill-explanation">
      <div className="drill-explanation-title">How to get there:</div>
      <div className="drill-step">
        <span className="drill-step-label">Step 1 — Dollar risk</span>
        <span className="drill-step-calc">
          ${problem.account_size.toLocaleString()} × {problem.risk_pct}% = <strong>${riskAmount.toLocaleString()}</strong>
        </span>
      </div>
      <div className="drill-step">
        <span className="drill-step-label">Step 2 — Risk per share</span>
        <span className="drill-step-calc">
          ${problem.entry.toFixed(2)} − ${problem.stop.toFixed(2)} = <strong>${riskPerShare.toFixed(2)}</strong>
        </span>
      </div>
      <div className="drill-step">
        <span className="drill-step-label">Step 3 — Position size</span>
        <span className="drill-step-calc">
          ${riskAmount.toLocaleString()} ÷ ${riskPerShare.toFixed(2)} = <strong>{result.correct_shares} shares</strong>
        </span>
      </div>
      {result.user_answer !== result.correct_shares && (
        <div className="drill-step drill-step-error">
          <span className="drill-step-label">Your answer</span>
          <span className="drill-step-calc">
            {result.user_answer} shares would risk{' '}
            <strong>${(result.user_answer * riskPerShare).toFixed(2)}</strong>{' '}
            ({((result.user_answer * riskPerShare / problem.account_size) * 100).toFixed(2)}% of account)
          </span>
        </div>
      )}
    </div>
  )
}

export default function RiskCalcDrill({ onComplete }) {
  const [problem, setProblem] = useState(null)
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api.train.generateRisk().then(setProblem)
  }, [])

  async function submit(e) {
    e.preventDefault()
    if (!problem || !answer) return
    setSubmitting(true)
    try {
      const res = await api.train.submitRisk({
        account_size: problem.account_size,
        risk_pct: problem.risk_pct,
        entry: problem.entry,
        stop: problem.stop,
        user_answer: parseInt(answer, 10),
      })
      setResult(res)
    } finally {
      setSubmitting(false)
    }
  }

  if (!problem) return <div className="placeholder-card">Loading drill…</div>

  return (
    <div className="drill-card">
      <h3>Risk Sizing Calculator</h3>
      <p style={{ fontSize: '0.85em', color: 'var(--muted)' }}>
        How many shares should you buy to risk exactly the target amount?
      </p>

      <div className="drill-params">
        <div className="drill-param">
          <div className="drill-param-label">Account Size</div>
          <div className="drill-param-value">${problem.account_size.toLocaleString()}</div>
        </div>
        <div className="drill-param">
          <div className="drill-param-label">Risk %</div>
          <div className="drill-param-value">{problem.risk_pct}%</div>
        </div>
        <div className="drill-param">
          <div className="drill-param-label">Entry Price</div>
          <div className="drill-param-value">${problem.entry.toFixed(2)}</div>
        </div>
        <div className="drill-param">
          <div className="drill-param-label">Stop Price</div>
          <div className="drill-param-value">${problem.stop.toFixed(2)}</div>
        </div>
      </div>

      {!result ? (
        <form className="drill-input-row" onSubmit={submit}>
          <input
            className="drill-input"
            type="number"
            min="1"
            placeholder="# shares"
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            autoFocus
          />
          <button className="btn-primary" type="submit" disabled={submitting || !answer}>
            Submit
          </button>
        </form>
      ) : (
        <>
          <div className={`drill-result ${result.score >= 80 ? 'pass' : 'fail'}`}>
            <div className="drill-result-score">{result.score.toFixed(0)} pts</div>
            <div className="drill-result-detail">
              Your answer: <strong>{result.user_answer}</strong> shares
              &nbsp;·&nbsp; Correct: <strong>{result.correct_shares}</strong> shares
              {result.score < 100 && <>&nbsp;·&nbsp; Off by {result.diff_pct}%</>}
            </div>
          </div>

          <Explanation problem={problem} result={result} />

          <button className="btn-primary" onClick={onComplete}>
            {result.score === 100 ? 'Nice work — next drill ›' : 'Try another ›'}
          </button>
        </>
      )}
    </div>
  )
}
