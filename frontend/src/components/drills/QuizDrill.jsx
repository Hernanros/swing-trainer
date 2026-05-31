import React, { useState, useEffect } from 'react'
import { api } from '../../api'
import { DRILL_QUESTIONS } from '../../data/drillQuestions'
import DrillChart from '../DrillChart'

function selectQuestions(bank, masteryRecords) {
  const masteryMap = {}
  for (const r of masteryRecords) {
    masteryMap[r.bank_idx] = r.state
  }
  const learning = []
  const newQ = []
  bank.forEach((q, i) => {
    const state = masteryMap[i] ?? 'new'
    if (state === 'mastered') return
    const item = { ...q, bank_idx: i }
    if (state === 'learning') learning.push(item)
    else newQ.push(item)
  })
  return [...learning, ...newQ].slice(0, 5)
}

export default function QuizDrill({ skill, drillKey, drillType, onComplete, questions: questionsProp }) {
  const [questions, setQuestions] = useState(null)
  const [allMastered, setAllMastered] = useState(false)
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

      let masteryRecords = []
      try {
        masteryRecords = await api.train.getMastery(drillKey)
      } catch (_) {
        // network error — treat all questions as new
      }

      const selected = selectQuestions(bank, masteryRecords)
      if (selected.length === 0) {
        setAllMastered(true)
      }
      setQuestions(selected)
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
      { q_idx: idx, bank_idx: q.bank_idx ?? null, chosen: i, answer: q.correct, is_correct: i === q.correct },
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
          await api.train.submitQuiz({
            skill,
            drill_type: drillType,
            score: finalScore,
            detail: answers,
            drill_key: drillKey ?? null,
          })
        }
      } finally {
        setSubmitting(false)
        setDone(true)
      }
    }
  }

  if (allMastered) {
    return (
      <div className="drill-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2em', marginBottom: 8 }}>✓</div>
        <div style={{ fontWeight: 700, color: 'var(--green)', marginBottom: 6 }}>All questions mastered</div>
        <div style={{ color: 'var(--text2)', fontSize: '0.9em', marginBottom: 16 }}>
          You've mastered every question in this drill.
        </div>
        <button className="btn-primary" onClick={onComplete}>Back to drills</button>
      </div>
    )
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
