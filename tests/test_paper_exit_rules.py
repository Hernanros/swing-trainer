"""Unit tests for the paper-trade exit decision function.

Exit thresholds match the live discipline in ~/Documents/trading-journal/lessons.md L007:
  early-win at 60% of max credit captured, stop-loss at 50% of max loss.
"""
from backend.main import decide_paper_exit, PAPER_PROFIT_TARGET_PCT, PAPER_STOP_LOSS_PCT


# Example spread used across tests:
#   Sold bull put 275/270 for $1.15 credit
#   width = $5, credit = $1.15, max_loss = $3.85
CREDIT = 1.15
WIDTH  = 5.00
MAX_LOSS = WIDTH - CREDIT  # 3.85


def test_hold_when_spread_barely_moved():
    # Same as opening — 0% profit — should hold
    assert decide_paper_exit(spread_mid=1.15, credit=CREDIT, width=WIDTH) is None


def test_hold_at_50pct_profit():
    # 50% profit means debit = 0.575 (halfway between 1.15 and 0). Below 60% threshold, hold.
    assert decide_paper_exit(spread_mid=0.58, credit=CREDIT, width=WIDTH) is None


def test_early_win_at_60pct_profit():
    # 60% profit target: debit = credit * 0.40 ≈ 0.46. Use 0.45 for comfortable
    # boundary crossing (float rep of 1.15 * 0.4 isn't exactly 0.46).
    result = decide_paper_exit(spread_mid=0.45, credit=CREDIT, width=WIDTH)
    assert result is not None
    outcome, pnl = result
    assert outcome == "early_win"
    assert pnl == round((CREDIT - 0.45) * 100, 2)  # ~$70


def test_early_win_at_65pct_profit():
    # Comfortably past the target — should fire
    result = decide_paper_exit(spread_mid=0.40, credit=CREDIT, width=WIDTH)
    assert result is not None
    assert result[0] == "early_win"


def test_hold_at_40pct_max_loss():
    # 40% max loss: debit = credit + max_loss * 0.4 = 1.15 + 1.54 = 2.69
    # Still under 50% stop threshold; hold
    assert decide_paper_exit(spread_mid=2.69, credit=CREDIT, width=WIDTH) is None


def test_stop_loss_at_50pct_max_loss_exact():
    # 50% max loss: debit = credit + max_loss * 0.5 = 1.15 + 1.925 = 3.075
    result = decide_paper_exit(spread_mid=3.075, credit=CREDIT, width=WIDTH)
    assert result is not None
    outcome, pnl = result
    assert outcome == "stop_loss"
    assert pnl == round((CREDIT - 3.075) * 100, 2)  # -1.925 * 100 = -$192.50


def test_stop_loss_at_deeper_loss():
    # 70% max loss — well past stop, fires
    result = decide_paper_exit(spread_mid=3.85, credit=CREDIT, width=WIDTH)
    assert result is not None
    assert result[0] == "stop_loss"


def test_returns_none_on_invalid_inputs():
    assert decide_paper_exit(spread_mid=None,   credit=CREDIT, width=WIDTH) is None
    assert decide_paper_exit(spread_mid=-0.10,  credit=CREDIT, width=WIDTH) is None
    assert decide_paper_exit(spread_mid=1.00,   credit=0,      width=WIDTH) is None
    assert decide_paper_exit(spread_mid=1.00,   credit=CREDIT, width=0)     is None
    # credit >= width means the "spread" has no risk — reject
    assert decide_paper_exit(spread_mid=1.00,   credit=5.0,    width=5.0)   is None


def test_thresholds_are_constants():
    # If we ever tune, tests should catch surprising drift
    assert PAPER_PROFIT_TARGET_PCT == 0.60
    assert PAPER_STOP_LOSS_PCT == 0.50
