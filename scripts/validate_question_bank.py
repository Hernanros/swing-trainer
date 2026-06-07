"""
Stage 2: Validate every generated question with a second Claude pass.

Usage:
  python3 scripts/validate_question_bank.py
  python3 scripts/validate_question_bank.py --category=technical_indicators

Output: scripts/output/validated-{category}.json
Each file mirrors generated-{category}.json but each question has a
"flag" field: "OK" | "WARN" | "ERROR" and a "flag_issue" field.
Script is idempotent: skips subtopics already in validated output.
"""
import json
import os
import sys
import time
import argparse

import anthropic

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from scripts.question_taxonomy import TAXONOMY

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")

_client = None

def _get_client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _client


def build_validation_prompt(question: dict) -> str:
    opts = "\n".join(
        f"{chr(65+i)}) {opt}" for i, opt in enumerate(question["options"])
    )
    correct_text = question["options"][question["correct"]]
    return f"""You are an expert swing trading educator reviewing quiz questions for factual accuracy.

Q: {question["q"]}
Options:
{opts}
Marked correct: {correct_text} (index {question["correct"]})
Explanation: {question["explanation"]}
Source: {question.get("source", "unknown")}

Check:
1. Is the marked answer factually correct for swing trading?
2. Could any other option be considered equally correct?
3. Is the question clearly worded without ambiguity?
4. Is the explanation accurate and complete?

Respond with JSON only, no markdown:
{{"verdict": "OK|WARN|ERROR", "issue": "description or null"}}

ERROR = wrong answer or significant factual error
WARN = minor ambiguity or misleading wording
OK = question is accurate and clear"""


def _strip_markdown_fence(text: str) -> str:
    """Remove ```json ... ``` or ``` ... ``` wrappers if present."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]
    return text.strip()


def parse_validation_result(raw_text: str) -> dict:
    """Parse Claude's verdict JSON. Returns a safe default on failure."""
    try:
        result = json.loads(_strip_markdown_fence(raw_text))
        if result.get("verdict") in ("OK", "WARN", "ERROR"):
            return result
    except (json.JSONDecodeError, AttributeError):
        pass
    return {"verdict": "WARN", "issue": f"Failed to parse validation response: {raw_text[:80]}"}


def validate_category(category_key: str) -> dict:
    generated_path = os.path.join(OUTPUT_DIR, f"generated-{category_key}.json")
    if not os.path.exists(generated_path):
        print(f"  skip (no generated file): {category_key}")
        return {"ok": 0, "warn": 0, "error": 0}

    with open(generated_path) as f:
        generated = json.load(f)

    validated_path = os.path.join(OUTPUT_DIR, f"validated-{category_key}.json")
    existing_validated = {}
    if os.path.exists(validated_path):
        with open(validated_path) as f:
            existing_validated = json.load(f)

    counts = {"ok": 0, "warn": 0, "error": 0}
    print(f"\n── validating {category_key} ──")

    for subtopic_name, questions in generated.items():
        if subtopic_name in existing_validated:
            for q in existing_validated[subtopic_name]:
                counts[q.get("flag", "warn").lower()] += 1
            print(f"  ✓ cached: {subtopic_name[:50]}")
            continue

        print(f"  → {subtopic_name[:50]}…", end="", flush=True)
        flagged = []

        for question in questions:
            try:
                response = _get_client().messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=200,
                    messages=[{"role": "user", "content": build_validation_prompt(question)}],
                )
                result = parse_validation_result(response.content[0].text)
                flagged.append({**question, "flag": result["verdict"], "flag_issue": result["issue"]})
                counts[result["verdict"].lower()] += 1
                time.sleep(0.3)
            except Exception as exc:
                flagged.append({**question, "flag": "ERROR", "flag_issue": str(exc)})
                counts["error"] += 1

        existing_validated[subtopic_name] = flagged
        with open(validated_path, "w") as f:
            json.dump(existing_validated, f, indent=2)
        ok_count = sum(1 for q in flagged if q["flag"] == "OK")
        print(f" {ok_count}/{len(flagged)} OK")

    return counts


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--category", help="Validate only this category key")
    args = parser.parse_args()

    categories = [args.category] if args.category else list(TAXONOMY.keys())
    total = {"ok": 0, "warn": 0, "error": 0}

    for cat in categories:
        result = validate_category(cat)
        for k in total:
            total[k] += result[k]

    print(f"\n── Validation complete ──")
    print(f"✓ OK:    {total['ok']}")
    print(f"⚠ WARN:  {total['warn']}")
    print(f"✗ ERROR: {total['error']}")
    if total["error"] > 0:
        print("ERROR questions excluded from merge. Review scripts/output/validated-*.json to fix manually.")
    print("\nRun: node scripts/merge_question_bank.mjs")
