/**
 * Stage 3: Merge validated questions into drillQuestions.js.
 *
 * Usage: node scripts/merge_question_bank.mjs [--category=technical_indicators]
 *
 * - Skips ERROR-flagged questions
 * - Appends new questions AFTER existing ones (preserves bank_idx for mastery)
 * - Balances answer positions (correct: 0/1/2/3 ~equally) among new questions
 * - Adds DRILL_META entries for new categories
 * - Rewrites frontend/src/data/drillQuestions.js
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, 'output')
const DRILL_QUESTIONS_PATH = resolve(__dirname, '..', 'frontend', 'src', 'data', 'drillQuestions.js')

// ── Pure functions (exported for testing) ──────────────────────────────────

export function rotateToPosition(question, targetCorrect) {
  const shift = ((targetCorrect - question.correct) % 4 + 4) % 4
  if (shift === 0) return question
  const rotated = [
    ...question.options.slice(shift),
    ...question.options.slice(0, shift),
  ]
  return { ...question, options: rotated, correct: targetCorrect }
}

export function balanceAnswerPositions(newQuestions) {
  const counts = [0, 0, 0, 0]
  return newQuestions.map(q => {
    const targetPos = counts.indexOf(Math.min(...counts))
    counts[targetPos]++
    return rotateToPosition(q, targetPos)
  })
}

export function serializeDrillQuestionsFile(questions, meta) {
  const qEntries = Object.entries(questions).map(([key, qs]) => {
    const lines = qs.map(q => '    ' + JSON.stringify(q)).join(',\n')
    return `  ${key}: [\n${lines},\n  ]`
  }).join(',\n\n')

  const metaEntries = Object.entries(meta).map(([key, val]) => {
    return `  ${key}: ${JSON.stringify(val)}`
  }).join(',\n')

  return `export const DRILL_QUESTIONS = {\n${qEntries}\n}\n\nexport const DRILL_META = {\n${metaEntries}\n}\n`
}

// ── New category metadata ──────────────────────────────────────────────────

const NEW_CATEGORY_META = {
  technical_indicators: { label: 'Technical Indicators', type: 'indicator_quiz', skill: 'technical_indicators' },
  market_internals:     { label: 'Market Internals',      type: 'internals_quiz', skill: 'market_internals'     },
  short_selling:        { label: 'Short Selling',          type: 'short_quiz',    skill: 'short_selling'        },
  gap_trading:          { label: 'Gap Trading',            type: 'gap_quiz',      skill: 'gap_trading'          },
}

// ── Main execution (only when run directly) ────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const categoryFilter = process.argv.find(a => a.startsWith('--category='))?.split('=')[1]

  // Dynamically import the existing question bank
  const { DRILL_QUESTIONS, DRILL_META } = await import(DRILL_QUESTIONS_PATH + '?ts=' + Date.now())
  const questions = JSON.parse(JSON.stringify(DRILL_QUESTIONS))
  const meta = JSON.parse(JSON.stringify(DRILL_META))

  // Read taxonomy keys to determine processing order
  const { TAXONOMY } = await import('./question_taxonomy.mjs')
  const categories = categoryFilter ? [categoryFilter] : Object.keys(TAXONOMY)

  let totalAdded = 0
  let totalSkipped = 0

  for (const categoryKey of categories) {
    const validatedPath = join(OUTPUT_DIR, `validated-${categoryKey}.json`)
    if (!existsSync(validatedPath)) {
      console.log(`skip (no validated file): ${categoryKey}`)
      continue
    }

    const validated = JSON.parse(readFileSync(validatedPath, 'utf8'))
    const newQuestions = []

    for (const subtopicQs of Object.values(validated)) {
      for (const q of subtopicQs) {
        if (q.flag === 'ERROR') { totalSkipped++; continue }
        const { flag, flag_issue, ...cleanQ } = q
        newQuestions.push(cleanQ)
      }
    }

    const balanced = balanceAnswerPositions(newQuestions)
    questions[categoryKey] = [...(questions[categoryKey] ?? []), ...balanced]

    if (NEW_CATEGORY_META[categoryKey] && !meta[categoryKey]) {
      meta[categoryKey] = NEW_CATEGORY_META[categoryKey]
    }

    totalAdded += balanced.length
    console.log(`${categoryKey}: +${balanced.length} (total: ${questions[categoryKey].length})`)
  }

  writeFileSync(DRILL_QUESTIONS_PATH, serializeDrillQuestionsFile(questions, meta), 'utf8')
  console.log(`\n✓ ${totalAdded} questions added, ${totalSkipped} ERROR questions skipped`)
  console.log(`Updated: ${DRILL_QUESTIONS_PATH}`)
}
