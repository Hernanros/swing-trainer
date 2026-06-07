"""
Stage 1: Generate questions for every sub-topic in the taxonomy.

Usage:
  python3 scripts/generate_question_bank.py
  python3 scripts/generate_question_bank.py --category=technical_indicators

Output: scripts/output/generated-{category}.json
Each JSON file is a dict keyed by subtopic name -> list of question dicts.
Script is idempotent: skips subtopics that already have output.
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
os.makedirs(OUTPUT_DIR, exist_ok=True)

_client = None

def _get_client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _client


def build_generation_prompt(
    category: str,
    subtopic: dict,
    sources: list,
    questions_per_subtopic: int,
    existing_questions: list,
) -> str:
    sample = "\n".join(f'- "{q["q"]}"' for q in existing_questions[:5])
    avoid_block = f"\nDo NOT duplicate any of these existing questions:\n{sample}\n" if sample else ""
    return f"""You are an expert swing trading instructor writing quiz questions for a professional trading education app.

Category: {category.replace("_", " ")}
Sub-topic: {subtopic["name"]}
Difficulty: {subtopic["difficulty"]}
Source authority: {", ".join(sources)}
{avoid_block}
Generate exactly {questions_per_subtopic} multiple-choice questions testing understanding of this specific concept.
Each question should test a different scenario or angle of the sub-topic.

Return ONLY a JSON array — no markdown, no explanation:
[
  {{
    "q": "Question text as a specific scenario",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct": 0,
    "explanation": "Why this answer is correct and why the others are wrong",
    "difficulty": "{subtopic["difficulty"]}",
    "tags": ["tag1", "tag2"]
  }}
]

"correct" is the 0-based index of the correct option.
Vary which index is correct across your {questions_per_subtopic} questions."""


def _strip_markdown_fence(text: str) -> str:
    """Remove ```json ... ``` or ``` ... ``` wrappers if present."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]
    return text.strip()


def parse_generated_questions(raw_text: str, source: str) -> list:
    """Parse Claude's JSON response. Returns only structurally valid questions."""
    try:
        items = json.loads(_strip_markdown_fence(raw_text))
    except json.JSONDecodeError:
        return []
    if not isinstance(items, list):
        return []
    valid = []
    for item in items:
        if not isinstance(item.get("options"), list) or len(item["options"]) != 4:
            continue
        if not isinstance(item.get("correct"), int) or item["correct"] not in range(4):
            continue
        if not item.get("q") or not item.get("explanation"):
            continue
        valid.append({**item, "source": source})
    return valid


def generate_for_category(category_key: str) -> None:
    config = TAXONOMY[category_key]
    output_path = os.path.join(OUTPUT_DIR, f"generated-{category_key}.json")
    existing_output = {}
    if os.path.exists(output_path):
        with open(output_path) as f:
            existing_output = json.load(f)

    existing_bank = []

    print(f"\n── {category_key} ({len(config['subtopics'])} subtopics) ──")
    source_primary = config["sources"][0]

    for subtopic in config["subtopics"]:
        name = subtopic["name"]
        if name in existing_output:
            print(f"  ✓ cached: {name[:60]}")
            continue

        print(f"  → generating: {name[:60]}…", end="", flush=True)
        prompt = build_generation_prompt(
            category=category_key,
            subtopic=subtopic,
            sources=config["sources"],
            questions_per_subtopic=config["questions_per_subtopic"],
            existing_questions=existing_bank,
        )

        try:
            response = _get_client().messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=2000,
                messages=[{"role": "user", "content": prompt}],
            )
            questions = parse_generated_questions(response.content[0].text, source_primary)
            if not questions:
                print(f" ✗ no valid questions parsed")
            else:
                existing_output[name] = questions
                with open(output_path, "w") as f:
                    json.dump(existing_output, f, indent=2)
                print(f" ✓ {len(questions)} questions")
        except Exception as exc:
            print(f" ✗ {exc}")

        time.sleep(0.6)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--category", help="Run only this category key")
    args = parser.parse_args()

    categories = [args.category] if args.category else list(TAXONOMY.keys())
    for cat in categories:
        if cat not in TAXONOMY:
            print(f"Unknown category: {cat}")
            sys.exit(1)
        generate_for_category(cat)

    print("\n✓ Generation complete. Run validate_question_bank.py next.")
