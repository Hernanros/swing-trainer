import os

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
        .filter(Trade.user_id == user.id, Trade.status == "closed")
        .order_by(Trade.created_at.desc())
        .limit(20)
        .all()
    )
    if trades:
        lines.append(f"\nRecent trades (last {len(trades)} closed):")
        for t in trades:
            checklist = f", checklist {t.checklist_score:.0f}%" if t.checklist_score is not None else ""
            setup = f" {t.setup_type}" if t.setup_type else ""
            lines.append(f"  {t.symbol} {t.direction}{setup}: {t.r_multiple:.2f}R{checklist}")

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


def generate_trade_debrief(trade) -> str:
    if not _api_key:
        return "[AI debrief unavailable — set ANTHROPIC_API_KEY to enable]"
    from anthropic import Anthropic
    client = Anthropic(api_key=_api_key)
    prompt = f"""You are a professional swing trading coach. Analyze this trade and write a concise debrief.

Trade:
- Symbol: {trade.symbol} | Direction: {trade.direction}
- Entry: ${trade.entry} | Stop: ${trade.stop} | Target: ${trade.target} | Exit: ${trade.exit}
- Shares: {trade.shares} | P&L: ${trade.pnl:.2f} ({trade.r_multiple:.2f}R)
- Setup type: {trade.setup_type or 'Not specified'}
- Plan adherence score: {f"{trade.checklist_score:.0f}%" if trade.checklist_score is not None else "N/A"}
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


def generate_daily_tip(skill: str) -> str:
    label = _SKILL_LABELS.get(skill, skill.replace("_", " ").title())
    if not _api_key:
        return (
            f"Tip for {label}: Focus on process over outcome. "
            "Set ANTHROPIC_API_KEY to get personalized AI coaching tips."
        )
    from anthropic import Anthropic
    client = Anthropic(api_key=_api_key)
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
        messages=[{"role": "user", "content": (
            f"You are an expert swing trading coach giving a quick daily tip to a student "
            f"who needs to improve their {label} skill. "
            "Write one concise, practical tip (3-5 sentences) they can apply today. "
            "Focus on a single actionable insight. Be specific, not generic. "
            "Plain text only — no bullet points, no headers."
        )}],
    )
    return message.content[0].text


def generate_ask_tip(question: str) -> str:
    if not _api_key:
        return "[AI answers unavailable — set ANTHROPIC_API_KEY to enable]"
    from anthropic import Anthropic
    client = Anthropic(api_key=_api_key)
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        messages=[{"role": "user", "content": (
            f'You are an expert swing trading coach. A student asks: "{question}"\n\n'
            "Answer concisely and practically in 3-5 sentences. "
            "Focus on actionable advice specific to swing trading. Plain text only."
        )}],
    )
    return message.content[0].text
