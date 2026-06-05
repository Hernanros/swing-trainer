import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from scripts.generate_question_bank import build_generation_prompt, parse_generated_questions


def test_build_generation_prompt_contains_subtopic():
    subtopic = {"name": "RSI divergence test", "difficulty": "intermediate"}
    prompt = build_generation_prompt(
        category="technical_indicators",
        subtopic=subtopic,
        sources=["Murphy - Technical Analysis"],
        questions_per_subtopic=5,
        existing_questions=[],
    )
    assert "RSI divergence test" in prompt
    assert "technical indicators" in prompt.lower()
    assert "5" in prompt


def test_build_generation_prompt_includes_existing_questions():
    existing = [{"q": "What does RSI measure?", "options": ["a", "b", "c", "d"], "correct": 0, "explanation": "e"}]
    subtopic = {"name": "RSI basics", "difficulty": "beginner"}
    prompt = build_generation_prompt(
        category="technical_indicators",
        subtopic=subtopic,
        sources=["Murphy - Technical Analysis"],
        questions_per_subtopic=5,
        existing_questions=existing,
    )
    assert "What does RSI measure?" in prompt


def test_parse_generated_questions_returns_list():
    raw = json.dumps([
        {
            "q": "What does RSI stand for?",
            "options": ["Relative Strength Index", "Rate of Speed Indicator", "Risk Score Index", "Relative Swing Indicator"],
            "correct": 0,
            "explanation": "RSI stands for Relative Strength Index.",
            "difficulty": "beginner",
            "tags": ["RSI"],
        }
    ])
    result = parse_generated_questions(raw, source="Murphy - Technical Analysis")
    assert len(result) == 1
    assert result[0]["q"] == "What does RSI stand for?"
    assert result[0]["source"] == "Murphy - Technical Analysis"


def test_parse_generated_questions_rejects_wrong_option_count():
    raw = json.dumps([
        {
            "q": "Bad question?",
            "options": ["a", "b"],  # only 2 options — invalid
            "correct": 0,
            "explanation": "e",
            "difficulty": "beginner",
            "tags": [],
        }
    ])
    result = parse_generated_questions(raw, source="test")
    assert result == []


def test_parse_generated_questions_rejects_out_of_range_correct():
    raw = json.dumps([
        {
            "q": "Bad correct index?",
            "options": ["a", "b", "c", "d"],
            "correct": 5,  # out of range
            "explanation": "e",
            "difficulty": "beginner",
            "tags": [],
        }
    ])
    result = parse_generated_questions(raw, source="test")
    assert result == []
