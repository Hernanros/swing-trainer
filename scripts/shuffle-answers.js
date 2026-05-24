// Redistributes correct answers evenly across positions 0-3.
// All questions currently have correct: 0 (option A always correct).
// After this script: ~25% each at positions 0, 1, 2, 3.
const fs = require('fs');
const filePath = process.argv[2];

const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');
const result = [...lines];

let questionCount = 0;
let i = 0;

while (i < lines.length) {
  // Match start of options block (6-space indent)
  if (/^      options: \[$/.test(lines[i])) {
    i++;

    const optIndices = [];
    while (i < lines.length && !/^      \],$/.test(lines[i])) {
      optIndices.push(i);
      i++;
    }
    const optEndIdx = i; // the ], line
    i++;

    // Find correct: 0 within next 4 lines
    let correctIdx = -1;
    for (let j = optEndIdx + 1; j < Math.min(optEndIdx + 5, lines.length); j++) {
      if (/^      correct: 0,$/.test(lines[j])) {
        correctIdx = j;
        break;
      }
    }

    if (correctIdx !== -1 && optIndices.length === 4) {
      // Cycle through positions 0,1,2,3 round-robin
      const targetPos = questionCount % 4;
      questionCount++;

      if (targetPos > 0) {
        const opts = optIndices.map(idx => result[idx]);
        const correct = opts[0];
        const rest = opts.slice(1); // [B, C, D]
        rest.splice(targetPos, 0, correct); // insert correct at targetPos
        // targetPos=1 → [B, correct, C, D]
        // targetPos=2 → [B, C, correct, D]
        // targetPos=3 → [B, C, D, correct]
        for (let j = 0; j < optIndices.length; j++) {
          result[optIndices[j]] = rest[j];
        }
        result[correctIdx] = result[correctIdx].replace('correct: 0,', `correct: ${targetPos},`);
      }
    }

    continue;
  }

  i++;
}

fs.writeFileSync(filePath, result.join('\n'));
console.log(`Done. Rotated answers for ${questionCount} questions.`);
console.log(`Distribution: ~${Math.round(questionCount/4)} per position (0,1,2,3)`);
