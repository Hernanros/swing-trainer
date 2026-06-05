import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rotateToPosition, balanceAnswerPositions, serializeDrillQuestionsFile } from './merge_question_bank.mjs'

const makeQ = (correct, opts = ['right', 'wrong1', 'wrong2', 'wrong3']) => ({
  q: 'Test question?',
  options: opts,
  correct,
  explanation: 'Explanation.',
  source: 'Test Source',
  difficulty: 'intermediate',
  tags: ['test'],
})

test('rotateToPosition: unchanged when target equals current', () => {
  const q = makeQ(1, ['a', 'b', 'c', 'd'])
  assert.deepEqual(rotateToPosition(q, 1), q)
})

test('rotateToPosition: correct option lands at target index', () => {
  const q = makeQ(0, ['right', 'wrong1', 'wrong2', 'wrong3'])
  const rotated = rotateToPosition(q, 2)
  assert.equal(rotated.correct, 2)
  assert.equal(rotated.options[2], 'right')
})

test('rotateToPosition: preserves all four options', () => {
  const q = makeQ(0, ['a', 'b', 'c', 'd'])
  const rotated = rotateToPosition(q, 3)
  assert.deepEqual(rotated.options.slice().sort(), ['a', 'b', 'c', 'd'])
})

test('balanceAnswerPositions: distributes 8 questions evenly (2 each)', () => {
  const qs = Array.from({ length: 8 }, () => makeQ(0))
  const balanced = balanceAnswerPositions(qs)
  const counts = [0, 0, 0, 0]
  balanced.forEach(q => counts[q.correct]++)
  counts.forEach(c => assert.equal(c, 2))
})

test('balanceAnswerPositions: preserves question count', () => {
  const qs = Array.from({ length: 5 }, () => makeQ(0))
  assert.equal(balanceAnswerPositions(qs).length, 5)
})

test('serializeDrillQuestionsFile: output contains export declarations', () => {
  const questions = { test_cat: [makeQ(0)] }
  const meta = { test_cat: { label: 'Test', type: 'test_quiz', skill: 'test' } }
  const output = serializeDrillQuestionsFile(questions, meta)
  assert.ok(output.includes('export const DRILL_QUESTIONS'))
  assert.ok(output.includes('export const DRILL_META'))
})

test('serializeDrillQuestionsFile: existing question text is preserved', () => {
  const questions = { cat: [makeQ(1)] }
  const output = serializeDrillQuestionsFile(questions, {})
  assert.ok(output.includes('Test question?'))
})

test('serializeDrillQuestionsFile: correct index is preserved in output', () => {
  const questions = { cat: [makeQ(2)] }
  const output = serializeDrillQuestionsFile(questions, {})
  assert.ok(output.includes('"correct":2'))
})
