import React, { useState, useEffect } from 'react'
import { api } from '../../api'
import { DRILL_QUESTIONS } from '../../data/drillQuestions'
import DrillChart from '../DrillChart'

function weightedSample(bank, weights, n) {
  const pool = bank.map((q, i) => ({
    ...q,
    bank_idx: i,
    _w: weights[String(i)] ?? 0.5,
  }))
  const result = []
  const remaining = [...pool]
  for (let pick = 0; pick < Math.min(n, remaining.length); pick++) {
    const total = remaining.reduce((s, item) => s + item._w, 0)
    let rand = Math.random() * total
    let chosen = remaining.length - 1
    for (let i = 0; i < remaining.length; i++) {
      rand -= remaining[i]._w
      if (rand <= 0) { chosen = i; break }
    }
    result.push(remaining[chosen])
    remaining.splice(chosen, 1)
  }
  return result
}

export default function QuizDrill({ skill, drillKey, drillType, onComplete, questions: questionsProp }) {
  const [questions, setQuestions] = useState(null)
  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const [answered, setAnswered] = useState(false)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [answers, setAnswers] = useState([])

  useEffect(() => {
    async function init() {
      if (questionsProp && questionsProp.length > 0) {
        setQuestions(questionsProp)
        return
      }
      const bank = DRILL_QUESTIONS[drillKey] || DRILL_QUESTIONS[skill] || []
      if (bank.length === 0) { setQuestions([]); return }

      let weights = {}
      try {
        const res = await api.train.getQuestionWeights(skill)
        weights = res.weights || {}
      } catch (_) {
        // fall back to uniform weights
      }

      setQuestions(weightedSample(bank, weights, 5))
    }
    init()
  }, [skill, drillKey, questionsProp])

  const q = questions?.[idx]

  async function handleSelect(i) {
    if (answered) return
    setSelected(i)
    setAnswered(true)
    if (i === q.correct) setScore(s => s + 1)
    setAnswers(prev => [
      ...prev,
      {
        q_idx: idx,
        bank_idx: q.bank_idx ?? null,
        chosen: i,
        answer: q.correct,
        is_correct: i === q.correct,
      },
    ])
  }

  async function next() {
    if (idx < questions.length - 1) {
      setIdx(i => i + 1)
      setSelected(null)
      setAnswered(false)
    } else {
      const finalScore = ((score + (selected === q.correct ? 1 : 0)) / questions.length) * 100
      setSubmitting(true)
      try {
        if (skill !== 'custom') {
          await api.train.submitQuiz({ skill, drill_type: drillType, score: finalScore, detail: answers })
        }
      } finally {
        setSubmitting(false)
        setDone(true)
      }
    }
  }

  if (!questions) {
    return <div className="drill-card" style={{ color: 'var(--muted)', textAlign: 'center' }}>Loading…</div>
  }

  if (done) {
    const finalScore = Math.round((score / questions.length) * 100)
    return (
      <div className="drill-card">
        <div className={`drill-result ${finalScore >= 60 ? 'pass' : 'fail'}`}>
          <div className="drill-result-score">{finalScore}%</div>
          <div className="drill-result-detail">
            {score} of {questions.length} correct
          </div>
        </div>
        <button className="btn-primary" onClick={onComplete}>
          {finalScore === 100 ? 'Perfect — next drill ›' : 'Try another ›'}
        </button>
      </div>
    )
  }

  return (
    <div className="drill-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>{q && skill.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</h3>
        <span style={{ fontSize: '0.8em', color: 'var(--muted)' }}>
          {idx + 1} / {questions.length}
        </span>
      </div>

      {q.chartKey && <DrillChart chartKey={q.chartKey} />}
      <p style={{ fontSize: '0.9em', color: 'var(--text2)', lineHeight: 1.5 }}>{q.q}</p>

      <div className="quiz-options">
        {q.options.map((opt, i) => {
          let cls = 'quiz-option'
          if (answered) {
            if (i === q.correct) cls += ' quiz-option-correct'
            else if (i === selected) cls += ' quiz-option-wrong'
            else cls += ' quiz-option-dim'
          }
          return (
            <button key={i} className={cls} onClick={() => handleSelect(i)} disabled={answered}>
              <span className="quiz-option-letter">{String.fromCharCode(65 + i)}</span>
              {opt}
            </button>
          )
        })}
      </div>

      {answered && (
        <div className="drill-explanation">
          <div className="drill-explanation-title">
            {selected === q.correct ? '✓ Correct' : '✗ Incorrect'}
          </div>
          <p style={{ fontSize: '0.88em', color: 'var(--text2)', lineHeight: 1.55 }}>
            {q.explanation}
          </p>
        </div>
      )}

      {answered && (
        <button className="btn-primary" onClick={next} disabled={submitting}>
          {idx < questions.length - 1 ? 'Next question ›' : submitting ? 'Saving…' : 'See results ›'}
        </button>
      )}
    </div>
  )
}
