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

_DEBIT_SPREADS = {"bull_call", "bear_put"}
_SPREAD_LABELS = {
    "bull_call": "Bull Call",
    "bear_put":  "Bear Put",
    "bull_put":  "Bull Put",
    "bear_call": "Bear Call",
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


def _build_debrief_prompt(
    trade,
    rule_detail: Optional[dict] = None,
    coaching_context: str = "",
    playbook_rules: list = None,
    setup_context: Optional[dict] = None,
) -> str:
    pnl_str = f"${trade.pnl:.2f}" if trade.pnl is not None else "N/A"
    r_str   = f"{trade.r_multiple:.2f}R" if trade.r_multiple is not None else "?R"

    # If we have BOTH playbook rules AND objective technical context, Claude can actually
    # judge each rule against real numbers instead of trusting (or speculating about) the
    # trader's checklist. That's the most useful debrief mode and takes priority over
    # self-report framing.
    can_evaluate_rules = bool(playbook_rules) and bool(setup_context)

    # Build compliance block from checklist self-assessment.
    # The trader's self-report is authoritative — do not override it with independent inference.
    # `has_adherence_signal` controls whether paragraph 1 covers plan adherence or the trade thesis:
    # with no checklist data at all, paragraph 1 about "adherence" forces the model into a
    # condescending "process credit isn't real" lecture, which the trader has explicitly rejected.
    has_adherence_signal = False
    if rule_detail:
        has_adherence_signal = True
        followed = rule_detail.get("followed") or []
        violated = rule_detail.get("violated") or []
        if followed and not violated:
            compliance_block = (
                f"- Plan adherence score: {f'{trade.checklist_score:.0f}%' if trade.checklist_score is not None else '100%'}\n"
                f"- Trader confirmed following ALL rules: {', '.join(followed)}\n"
                f"IMPORTANT: The trader followed their full playbook on this trade. "
                f"Acknowledge this in paragraph 1. Do not question or second-guess it."
            )
        elif violated:
            followed_str = ", ".join(followed) if followed else "none"
            violated_str = ", ".join(violated)
            compliance_block = (
                f"- Plan adherence score: {f'{trade.checklist_score:.0f}%' if trade.checklist_score is not None else 'N/A'}\n"
                f"- Rules trader confirmed following: {followed_str}\n"
                f"- Rules trader self-reported NOT following: {violated_str}\n"
                f"Trust this self-assessment. For each violated rule mention the consequence once, briefly, then move on."
            )
        else:
            compliance_block = (
                f"- Plan adherence score: N/A (checklist submitted but no items recorded)\n"
                f"Do not assess rule compliance — focus on trade structure and outcome."
            )
    elif trade.checklist_score is not None:
        has_adherence_signal = True
        compliance_block = (
            f"- Plan adherence score (graded at entry): {trade.checklist_score:.0f}%\n"
            "Treat this entry-time score as authoritative. The trader did not re-grade at close. "
            "Do NOT speculate about which specific rules were or weren't followed. "
            "Do NOT lecture about missing close-time checklist."
        )
    else:
        compliance_block = (
            "- No checklist information is available for this trade.\n"
            "STRICT RULE: Do NOT mention the checklist, plan adherence, process credit, "
            "rule compliance, habit-building, or any related framing anywhere in your output. "
            "Treat the trade purely on its structural and outcome merits."
        )

    if (trade.trade_type or "equity") == "option_spread":
        long_s   = trade.option_long_strike  or 0.0
        short_s  = trade.option_short_strike or 0.0
        width    = abs(long_s - short_s)
        is_debit = trade.option_spread_type in _DEBIT_SPREADS
        if is_debit:
            max_loss   = round(trade.entry * trade.shares * 100, 2)
            max_profit = round((width - trade.entry) * trade.shares * 100, 2)
        else:
            max_loss   = round((width - trade.entry) * trade.shares * 100, 2)
            max_profit = round(trade.entry * trade.shares * 100, 2)
        spread_label  = _SPREAD_LABELS.get(trade.option_spread_type, trade.option_spread_type)
        bias_label    = "Bullish" if trade.option_spread_type in ("bull_call", "bull_put") else "Bearish"
        premium_label = "paid" if is_debit else "received"
        trade_block = (
            f"- Symbol: {trade.symbol} | Spread: {spread_label} "
            f"({'debit' if is_debit else 'credit'}) | Bias: {bias_label}\n"
            f"- Strikes: {trade.option_long_strike}/{trade.option_short_strike} | Expiry: {trade.option_expiry}\n"
            f"- Premium {premium_label}: ${trade.entry} | Exit premium: ${trade.exit} | Contracts: {trade.shares}\n"
            f"- P&L: {pnl_str} ({r_str} vs max risk)\n"
            f"- Max risk: ${max_loss} | Max profit: ${max_profit}\n"
            f"- Setup type: {trade.setup_type or 'Not specified'}\n"
            f"- Pre-trade note: {trade.pre_note or 'None'}\n"
            f"{compliance_block}"
        )
        if getattr(trade, 'pre_trade_advisory', None):
            trade_block += f"\n- Pre-trade advisory: {trade.pre_trade_advisory}"
        if can_evaluate_rules:
            paragraphs = (
                "Write exactly 4 short paragraphs:\n"
                "1. Setup validity — walk through each [MUST] and [SHOULD] playbook rule and judge whether the "
                "Technical context shows it was met at entry. Cite the specific number from the context for each "
                "rule (e.g., 'Above 50 MA: YES, close $X vs SMA50 $Y'). Be concrete; no hedging.\n"
                "2. Spread structure — were the strikes, expiry, and premium appropriate for the thesis?\n"
                "3. Risk management — was position size appropriate relative to max risk, and was the trade managed well?\n"
                "4. Key lesson — one specific, actionable observation from this trade."
            )
            if getattr(trade, 'pre_trade_advisory', None):
                paragraphs += "\n\nIn paragraph 1, briefly compare whether the outcome matched the pre-trade advisory."
        elif has_adherence_signal:
            paragraphs = (
                "Write exactly 4 short paragraphs:\n"
                "1. Plan adherence — acknowledge what the trader got right based on their self-reported checklist; "
                "if rules were violated, state the consequence once without lecturing.\n"
                "2. Spread structure — were the strikes, expiry, and premium appropriate for the thesis?\n"
                "3. Risk management — was position size appropriate relative to max risk, and was the trade managed well?\n"
                "4. Key lesson — one specific, actionable observation from this trade."
            )
            if getattr(trade, 'pre_trade_advisory', None):
                paragraphs += "\n\nIn paragraph 1, briefly compare whether the outcome matched the pre-trade advisory."
        else:
            paragraphs = (
                "Write exactly 4 short paragraphs:\n"
                "1. Trade thesis — what was the bullish/bearish case implied by the spread, and did price action validate it?\n"
                "2. Spread structure — were the strikes, expiry, and premium appropriate for that thesis?\n"
                "3. Risk management — was position size appropriate relative to max risk, and was the trade managed well?\n"
                "4. Key lesson — one specific, actionable observation from this trade."
            )
            if getattr(trade, 'pre_trade_advisory', None):
                paragraphs += "\n\nIn paragraph 1, briefly compare whether the outcome matched the pre-trade advisory."
    else:
        trade_block = (
            f"- Symbol: {trade.symbol} | Direction: {trade.direction}\n"
            f"- Entry: ${trade.entry} | Stop: ${trade.stop} | Target: ${trade.target} | Exit: ${trade.exit}\n"
            f"- Shares: {trade.shares} | P&L: {pnl_str} ({r_str})\n"
            f"- Setup type: {trade.setup_type or 'Not specified'}\n"
            f"- Pre-trade note: {trade.pre_note or 'None'}\n"
            f"{compliance_block}"
        )
        if can_evaluate_rules:
            paragraphs = (
                "Write exactly 4 short paragraphs:\n"
                "1. Setup validity — walk through each [MUST] and [SHOULD] playbook rule and judge whether the "
                "Technical context shows it was met at entry. Cite the specific number from the context for each "
                "rule (e.g., 'Above 50 MA: YES, close $X vs SMA50 $Y'). Be concrete; no hedging.\n"
                "2. Entry quality — was entry precise and well-timed given that context?\n"
                "3. Risk management — was the stop structural, sized correctly, and honoured?\n"
                "4. Key lesson — one specific, actionable observation from this trade."
            )
        elif has_adherence_signal:
            paragraphs = (
                "Write exactly 4 short paragraphs:\n"
                "1. Plan adherence — acknowledge what the trader got right based on their self-reported checklist; "
                "if rules were violated, state the consequence once without lecturing.\n"
                "2. Entry quality — was entry precise and well-timed?\n"
                "3. Risk management — was the stop structural, sized correctly, and honoured?\n"
                "4. Key lesson — one specific, actionable observation from this trade."
            )
        else:
            paragraphs = (
                "Write exactly 4 short paragraphs:\n"
                "1. Trade thesis — what was the directional case at entry, and did price action validate it?\n"
                "2. Entry quality — was entry precise and well-timed?\n"
                "3. Risk management — was the stop structural, sized correctly, and honoured?\n"
                "4. Key lesson — one specific, actionable observation from this trade."
            )

    context_block = f"\nStudent context:\n{coaching_context}\n" if coaching_context else ""
    if playbook_rules:
        rules_text = "\n".join(f"- [{r.tier.upper()}] {r.text}" for r in playbook_rules)
        if can_evaluate_rules:
            rules_block = (
                f"\nPlaybook rules for this setup ({trade.setup_type}):\n{rules_text}\n"
                "Use the Technical context block below to evaluate each [MUST] and [SHOULD] "
                "rule against the actual numbers at entry. State met/not-met with the specific "
                "data point that proves it. Do not invent rules the trader didn't write.\n"
            )
        else:
            rules_block = (
                f"\nPlaybook rules for this setup ({trade.setup_type}) — for reference only, "
                f"do NOT re-evaluate compliance independently:\n{rules_text}\n"
            )
    else:
        rules_block = ""

    if setup_context:
        from backend.services.setup_analyzer import format_setup_context
        setup_block = f"\n{format_setup_context(setup_context)}\n"
    else:
        setup_block = ""

    prompt = (
        f"You are a supportive but honest swing trading coach. Write a concise debrief that helps the trader improve."
        f"{context_block}"
        f"{rules_block}"
        f"{setup_block}\n"
        f"Trade:\n{trade_block}\n\n"
        f"{paragraphs}\n\n"
        f"Be specific and constructive. The checklist self-assessment is the authoritative record of plan adherence — "
        f"do not override it. No generic advice. No moralizing."
    )
    return prompt


def generate_trade_debrief(
    trade,
    rule_detail: Optional[dict] = None,
    coaching_context: str = "",
    playbook_rules: list = None,
    setup_context: Optional[dict] = None,
) -> str:
    if not _api_key:
        return "[AI debrief unavailable — set ANTHROPIC_API_KEY to enable]"
    from anthropic import Anthropic
    client = Anthropic(api_key=_api_key)

    prompt = _build_debrief_prompt(
        trade,
        rule_detail=rule_detail,
        coaching_context=coaching_context,
        playbook_rules=playbook_rules,
        setup_context=setup_context,
    )

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def generate_spread_advisory(trade_data, rules: list) -> str:
    """Return a pre-trade spread advisory (< 200 words, 3 paragraphs).

    Gracefully degrades when ANTHROPIC_API_KEY is unset.
    """
    if not _api_key:
        return "[Advisory unavailable — set ANTHROPIC_API_KEY to enable]"

    symbol              = trade_data.symbol
    option_spread_type  = trade_data.option_spread_type
    option_long_strike  = trade_data.option_long_strike
    option_short_strike = trade_data.option_short_strike
    option_expiry       = trade_data.option_expiry
    entry_price         = trade_data.entry_price
    shares              = trade_data.shares

    width       = abs(option_long_strike - option_short_strike)
    is_debit    = option_spread_type in _DEBIT_SPREADS
    spread_label = _SPREAD_LABELS.get(option_spread_type, option_spread_type)

    if is_debit:
        max_loss   = round(entry_price * shares * 100, 2)
        max_profit = round((width - entry_price) * shares * 100, 2)
    else:
        max_loss   = round((width - entry_price) * shares * 100, 2)
        max_profit = round(entry_price * shares * 100, 2)

    premium_label = "paid" if is_debit else "received"

    if rules:
        rules_text = "\n".join(f"- [{r.tier.upper()}] {r.text}" for r in rules)
    else:
        rules_text = "No playbook rules loaded."

    from datetime import date as _date
    today = _date.today().isoformat()

    prompt = (
        f"You are a professional options trading coach reviewing a spread before the trade is placed.\n\n"
        f"Today's date: {today}\n"
        f"Spread: {spread_label} on {symbol}\n"
        f"Strikes: {option_long_strike}/{option_short_strike} (width: {width})\n"
        f"Expiry: {option_expiry}\n"
        f"Premium {premium_label}: ${entry_price} x {shares} contract(s)\n"
        f"Max risk: ${max_loss} | Max profit: ${max_profit}\n\n"
        f"Playbook rules:\n{rules_text}\n\n"
        f"Write exactly 3 unlabeled paragraphs of 2–3 sentences each:\n"
        f"1. Strike placement — are the strikes well-positioned relative to current price action?\n"
        f"2. Risk/reward quality — is the premium and risk/reward ratio favorable?\n"
        f"3. Expectations + when to close + primary risk to watch.\n\n"
        f"Plain text only. No headers. Under 200 words total."
    )

    from anthropic import Anthropic
    client = Anthropic(api_key=_api_key)
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=300,
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


def generate_setup_brief(candidate: dict, macro: dict, sectors: list) -> str:
    """
    2-3 sentence qualitative brief for a complete bull put spread candidate.
    Uses claude-sonnet-4-6, max_tokens=150. Returns fallback string if no API key.
    """
    if not _api_key:
        return f"[Setup brief unavailable — set ANTHROPIC_API_KEY] ({candidate.get('symbol', '?')})"
    sym = candidate.get("symbol", "?")
    close = candidate.get("close", 0)
    proximity = candidate.get("channel_proximity_pct", 0) or 0
    rsi_slope_val = candidate.get("rsi_slope", 0) or 0
    sector = candidate.get("sector", "unknown")
    sector_label = candidate.get("sector_label", "neutral")
    spy_regime = (macro.get("spy") or {}).get("regime", "neutral")
    qqq_regime = (macro.get("qqq") or {}).get("regime", "neutral")
    sector_note = next(
        (f"{s['symbol']} sector is {s.get('label', 'neutral')} ({s.get('pct_vs_20d', 0):+.1f}% vs 20d)"
         for s in sectors if s.get("symbol") == sector),
        f"Sector {sector}: {sector_label}",
    )
    prompt = (
        f"Write a 2-3 sentence qualitative brief for a bull put spread on {sym}.\n\n"
        f"Setup data:\n"
        f"- ${close:.2f}, {proximity:.0%} into upward channel (near lower band)\n"
        f"- RSI slope {rsi_slope_val:+.2f} (positive = turning up)\n"
        f"- Macro: SPY {spy_regime}, QQQ {qqq_regime}\n"
        f"- {sector_note}\n\n"
        f"Focus on why the channel position matters today, what RSI slope suggests, "
        f"and one thing to watch. Plain text only. No score, no rating."
    )
    try:
        from anthropic import Anthropic
        client = Anthropic(api_key=_api_key)
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=150,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()
    except Exception as e:
        _log.error("generate_setup_brief failed for %s: %s", sym, e)
        return f"[Brief unavailable — {sym}]"
