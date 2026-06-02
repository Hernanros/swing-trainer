import os
import xml.etree.ElementTree as ET
from typing import Optional

_api_key = os.getenv("ANTHROPIC_API_KEY")

_SKILL_LABELS = {
    "setup_selection":    "Setup Selection",
    "entry_timing":       "Entry Timing",
    "trade_management":   "Trade Management",
    "emotional_discipline": "Emotional Discipline",
    "chart_reading":      "Chart Reading",
    "risk_sizing":        "Risk Sizing",
}


def get_user_coaching_context(user, db) -> str:
    from backend.models import SkillScore, Trade

    lines = [f"User: {user.name} | Stage: {user.trading_stage} | Budget: {user.time_budget}"]

    scores = db.query(SkillScore).filter(SkillScore.user_id == user.id).all()
    if scores:
        weakest = min(scores, key=lambda s: s.score)
        weakest_label = _SKILL_LABELS.get(weakest.skill, weakest.skill)
        score_parts = [
            f"{_SKILL_LABELS.get(s.skill, s.skill)}: {s.score:.0f}"
            for s in sorted(scores, key=lambda s: s.score)
        ]
        lines.append(f"Weakest skill: {weakest_label} ({weakest.score:.0f})")
        lines.append("Skill scores: " + ", ".join(score_parts))

    trades = (
        db.query(Trade)
        .filter(Trade.user_id == user.id, Trade.status == "closed", Trade.practice == False)
        .order_by(Trade.created_at.desc())
        .limit(20)
        .all()
    )
    if trades:
        lines.append(f"\nRecent trades (last {len(trades)} closed):")
        for t in trades:
            checklist = f", checklist {t.checklist_score:.0f}%" if t.checklist_score is not None else ""
            setup = f" {t.setup_type}" if t.setup_type else ""
            r_str = f"{t.r_multiple:.2f}R" if t.r_multiple is not None else "?R"
            lines.append(f"  {t.symbol} {t.direction}{setup}: {r_str}{checklist}")

    return "\n".join(lines)


def call_claude(prompt: str, max_tokens: int = 1000) -> str:
    """Generic helper: sends a single user message and returns the text response."""
    if not _api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    from anthropic import Anthropic
    client = Anthropic(api_key=_api_key)
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def generate_trade_debrief(trade, rule_detail: Optional[dict] = None) -> str:
    if not _api_key:
        return "[AI debrief unavailable — set ANTHROPIC_API_KEY to enable]"
    from anthropic import Anthropic
    client = Anthropic(api_key=_api_key)

    followed_str = ", ".join(rule_detail["followed"]) if rule_detail and rule_detail.get("followed") else "none recorded"
    violated_str = ", ".join(rule_detail["violated"]) if rule_detail and rule_detail.get("violated") else "none recorded"

    prompt = f"""You are a professional swing trading coach. Analyze this trade and write a concise debrief.

Trade:
- Symbol: {trade.symbol} | Direction: {trade.direction}
- Entry: ${trade.entry} | Stop: ${trade.stop} | Target: ${trade.target} | Exit: ${trade.exit}
- Shares: {trade.shares} | P&L: ${trade.pnl:.2f} ({trade.r_multiple:.2f}R)
- Setup type: {trade.setup_type or 'Not specified'}
- Plan adherence score: {f"{trade.checklist_score:.0f}%" if trade.checklist_score is not None else "N/A"}
- Rules followed: {followed_str}
- Rules violated: {violated_str}
- Pre-trade note: {trade.pre_note or 'None'}

Write exactly 4 short paragraphs:
1. Plan adherence — did the trade match the pre-trade note and checklist?
2. Entry quality — was entry precise and well-timed?
3. Risk management — was the stop structural, sized correctly, and honoured?
4. Key lesson — one specific, actionable observation from this trade.

Be direct and specific. No generic advice."""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def generate_daily_tip(skill: str, context: str = "") -> str:
    label = _SKILL_LABELS.get(skill, skill.replace("_", " ").title())
    if not _api_key:
        return (
            f"Tip for {label}: Focus on process over outcome. "
            "Set ANTHROPIC_API_KEY to get personalized AI coaching tips."
        )
    from anthropic import Anthropic
    client = Anthropic(api_key=_api_key)
    base_role = (
        f"You are an expert swing trading coach giving a quick daily tip to a student "
        f"who needs to improve their {label} skill. "
        "Write one concise, practical tip (3-5 sentences) they can apply today. "
        "Focus on a single actionable insight. Be specific, not generic. "
        "Plain text only — no bullet points, no headers."
    )
    if context:
        role = base_role.replace(
            "Focus on a single actionable insight.",
            "Reference this student's actual trade patterns where relevant. Focus on a single actionable insight."
        )
        system = [
            {"type": "text", "text": context, "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": role},
        ]
    else:
        system = base_role
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
        system=system,
        messages=[{"role": "user", "content": f"Give me a daily tip on {label}."}],
    )
    return message.content[0].text


def generate_ask_tip(question: str, context: str = "") -> str:
    if not _api_key:
        return "[AI answers unavailable — set ANTHROPIC_API_KEY to enable]"
    from anthropic import Anthropic
    client = Anthropic(api_key=_api_key)
    base_role = (
        "You are an expert swing trading coach. "
        "Answer concisely and practically in 3-5 sentences. "
        "Focus on actionable advice specific to swing trading. Plain text only."
    )
    if context:
        role = base_role.replace(
            "Focus on actionable advice",
            "Reference this student's actual trade patterns where relevant. Focus on actionable advice"
        )
        system = [
            {"type": "text", "text": context, "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": role},
        ]
    else:
        system = base_role
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        system=system,
        messages=[{"role": "user", "content": question}],
    )
    return message.content[0].text


def generate_pattern_analysis(context: str) -> list:
    """Call Claude Haiku with coaching context; return list of {severity, pattern_text} dicts.

    Raises RuntimeError if API key missing.
    Raises ValueError if Claude returns unparseable XML or zero valid patterns.
    """
    if not _api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    from anthropic import Anthropic
    client = Anthropic(api_key=_api_key)
    system = [
        {"type": "text", "text": context, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": (
            "You are an expert swing trading coach analyzing a student's trade journal. "
            "Be direct and specific. Reference actual numbers from the data."
        )},
    ]
    user_message = (
        "Analyze this trader's journal and identify 3 to 5 recurring behavioral patterns.\n"
        "Return ONLY this XML — no other text:\n\n"
        "<patterns>\n"
        "  <pattern severity=\"problem\" skill=\"trade_management\">...</pattern>\n"
        "  <pattern severity=\"watch\" skill=\"emotional_discipline\">...</pattern>\n"
        "  <pattern severity=\"strength\">...</pattern>\n"
        "</patterns>\n\n"
        "Severity rules:\n"
        "- problem: a repeated mistake actively costing edge (cite trade counts)\n"
        "- watch: a tendency worth monitoring that isn't clearly hurting yet\n"
        "- strength: a discipline the trader is consistently getting right\n\n"
        "Skill attribute (optional): set to the single most relevant skill from: "
        "setup_selection, entry_timing, risk_sizing, trade_management, emotional_discipline, chart_reading. "
        "Omit the attribute entirely if the pattern doesn't map cleanly to one skill.\n\n"
        "Each pattern must be one sentence, specific, and cite actual numbers where possible."
    )
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=600,
        system=system,
        messages=[{"role": "user", "content": user_message}],
    )
    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1]
        if raw.endswith("```"):
            raw = raw[:-3].strip()
        else:
            raw = raw.rsplit("```", 1)[0].strip()
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as exc:
        raise ValueError(f"Claude returned unparseable XML: {exc}") from exc
    if root.tag != "patterns":
        raise ValueError(f"Unexpected XML root tag: {root.tag!r}")
    patterns = []
    for elem in root.findall("pattern"):
        severity = elem.get("severity", "").strip()
        skill = elem.get("skill", "").strip() or None
        text = (elem.text or "").strip()
        if severity in ("problem", "watch", "strength") and text:
            patterns.append({"severity": severity, "pattern_text": text, "skill": skill})
    if not patterns:
        raise ValueError("No valid patterns parsed from Claude response")
    return patterns
