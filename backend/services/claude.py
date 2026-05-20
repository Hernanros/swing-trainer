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
