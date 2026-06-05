"""
Course outline for the drill question bank expansion.
Each sub-topic generates questionsPerSubtopic questions via Claude.
Existing questions in a category are shown to Claude to avoid duplicates.
"""

TAXONOMY = {
    # ── Expanding existing categories ────────────────────────────────────────
    "setup_selection": {
        "questions_per_subtopic": 5,
        "sources": [
            "O'Neil - How to Make Money in Stocks",
            "Minervini - Trade Like a Stock Market Wizard",
        ],
        "subtopics": [
            {"name": "CANSLIM fundamentals: minimum EPS and revenue growth rates required before considering a breakout entry", "difficulty": "intermediate"},
            {"name": "IPO bases: how to identify a valid first-stage IPO base and its breakout pivot", "difficulty": "intermediate"},
            {"name": "Pocket pivot entries: identifying a strong up-volume day within the base as an early entry signal", "difficulty": "advanced"},
            {"name": "Three-weeks-tight pattern: recognizing three consecutive weekly closes within 1-1.5% as a valid add point", "difficulty": "intermediate"},
            {"name": "Handle quality: characteristics of a valid handle vs a flawed handle on a cup-with-handle base", "difficulty": "intermediate"},
            {"name": "Relative Strength rank and percentile: minimum RS threshold and what a leading RS line signals before a breakout", "difficulty": "beginner"},
            {"name": "Market follow-through day: how to confirm a new market uptrend before initiating new swing positions", "difficulty": "intermediate"},
            {"name": "Distribution day count: when the count of distribution days signals increased market risk", "difficulty": "intermediate"},
            {"name": "Sector leadership identification: how to confirm you are buying in the leading sector", "difficulty": "intermediate"},
            {"name": "Base quality and structure: symmetry, tight weekly closes, and volume pattern in a well-formed base", "difficulty": "beginner"},
        ],
    },
    "entry_timing": {
        "questions_per_subtopic": 5,
        "sources": [
            "O'Neil - How to Make Money in Stocks",
            "Minervini - Trade Like a Stock Market Wizard",
        ],
        "subtopics": [
            {"name": "Pre-market gap assessment: how to evaluate a stock that has gapped up before the regular session opens", "difficulty": "intermediate"},
            {"name": "Opening range breakout: using the first 15-30 minutes to define a tradeable high/low range", "difficulty": "intermediate"},
            {"name": "Limit vs market orders on breakouts: when to use each and the risks on volatile breakout days", "difficulty": "beginner"},
            {"name": "Scaling into a position: rules for taking a starter position vs waiting to add at confirmation", "difficulty": "intermediate"},
            {"name": "Re-entry conditions after a stop-out: what must be true before trading the same stock again", "difficulty": "intermediate"},
            {"name": "5-minute chart for precision entry timing at the exact pivot point", "difficulty": "intermediate"},
            {"name": "End-of-day entries: pros and cons of buying at the close vs the moment a breakout triggers intraday", "difficulty": "beginner"},
            {"name": "Avoiding the midday lull: why 11am-2pm is low-probability for new breakout entries", "difficulty": "beginner"},
            {"name": "Entering after a positive earnings gap: how to buy a stock that gaps above your planned entry", "difficulty": "advanced"},
        ],
    },
    "trade_management": {
        "questions_per_subtopic": 5,
        "sources": [
            "O'Neil - How to Make Money in Stocks",
            "Elder - Trading for a Living",
            "Minervini - Trade Like a Stock Market Wizard",
        ],
        "subtopics": [
            {"name": "R-multiple framework: defining 1R as the distance to the stop and using it to size positions and set targets", "difficulty": "beginner"},
            {"name": "Portfolio heat: calculating total open risk across all positions and setting a maximum exposure limit", "difficulty": "intermediate"},
            {"name": "Scaling out at targets: partial profit-taking rules at 1R, 2R, and 3R levels", "difficulty": "intermediate"},
            {"name": "ATR-based trailing stops: using average true range to trail a winning position dynamically", "difficulty": "advanced"},
            {"name": "Gap-down risk: how to respond when an open position gaps down at the market open", "difficulty": "intermediate"},
            {"name": "Overnight exposure rules: position-sizing and risk limits for holding trades overnight", "difficulty": "intermediate"},
            {"name": "Maximum drawdown rules: defining a daily and monthly loss limit that triggers a trading pause", "difficulty": "intermediate"},
            {"name": "Sector rotation response: when and how to adjust existing positions as sector leadership shifts", "difficulty": "advanced"},
            {"name": "Time stop: exiting positions that fail to make progress within 3-6 weeks regardless of price stop", "difficulty": "intermediate"},
        ],
    },
    "emotional_discipline": {
        "questions_per_subtopic": 5,
        "sources": [
            "Douglas - Trading in the Zone",
            "Elder - Trading for a Living",
        ],
        "subtopics": [
            {"name": "Confirmation bias: only seeking information that supports an existing trade thesis", "difficulty": "intermediate"},
            {"name": "Recency bias: overweighting recent wins or losses when evaluating current setups", "difficulty": "intermediate"},
            {"name": "Overtrading after a big win: the hot-hand fallacy and its effect on risk-taking", "difficulty": "intermediate"},
            {"name": "Pre-market routine: building a consistent preparation process that separates research from impulsive trading", "difficulty": "beginner"},
            {"name": "Post-trade review: how to conduct an objective review after each closed trade", "difficulty": "intermediate"},
            {"name": "FOMO in a bull market: psychological pressure to deploy capital at any price during a strong advance", "difficulty": "intermediate"},
            {"name": "Paralysis after a drawdown: inability to execute valid setups following a losing streak", "difficulty": "intermediate"},
            {"name": "Community and forum influence: how social trading groups distort independent decision-making", "difficulty": "intermediate"},
        ],
    },
    "chart_reading": {
        "questions_per_subtopic": 5,
        "sources": [
            "O'Neil - How to Make Money in Stocks",
            "Murphy - Technical Analysis of Financial Markets",
        ],
        "subtopics": [
            {"name": "Accumulation vs distribution days: identifying institutional buying and selling by price and volume action", "difficulty": "intermediate"},
            {"name": "Churning: recognizing high-volume days with minimal price progress as a distribution warning", "difficulty": "advanced"},
            {"name": "Volume dry-up (VDU): identifying when selling pressure has exhausted itself during a base formation", "difficulty": "intermediate"},
            {"name": "Weekly vs daily chart priority: when to use each timeframe and how to reconcile conflicts", "difficulty": "intermediate"},
            {"name": "Stalling action: subtle topping signals near price highs before a distribution breakdown", "difficulty": "advanced"},
            {"name": "Price spread analysis: interpreting price range width and volume together to read institutional intent", "difficulty": "intermediate"},
            {"name": "Gap type identification: classifying common, breakaway, continuation, and exhaustion gaps from context", "difficulty": "intermediate"},
            {"name": "Island reversals: when a stock becomes isolated by gaps on both sides and what it signals", "difficulty": "advanced"},
        ],
    },
    "chart_patterns": {
        "questions_per_subtopic": 3,
        "sources": [
            "Murphy - Technical Analysis of Financial Markets",
            "Bulkowski - Encyclopedia of Chart Patterns",
        ],
        "subtopics": [
            {"name": "Ascending triangle: flat resistance ceiling with a rising support floor and its breakout implications", "difficulty": "beginner"},
            {"name": "Descending triangle: flat support floor with a falling resistance ceiling and its breakdown implications", "difficulty": "beginner"},
            {"name": "Symmetrical triangle: converging trendlines with no directional bias and how to trade the breakout", "difficulty": "intermediate"},
            {"name": "Rising wedge: bearish pattern with higher highs and higher lows but converging lines", "difficulty": "intermediate"},
            {"name": "Falling wedge: bullish continuation/reversal pattern with lower highs and lower lows but converging lines", "difficulty": "intermediate"},
            {"name": "Pennant: brief tight consolidation after a sharp directional move; how it differs from a flag", "difficulty": "intermediate"},
            {"name": "Cup without handle: rounded base that breaks out without forming a handle; pros and cons", "difficulty": "intermediate"},
            {"name": "High tight flag: rare pattern with 100%+ advance followed by a tight 10-25% consolidation", "difficulty": "advanced"},
            {"name": "Morning star and evening star: three-candle reversal patterns at market turning points", "difficulty": "intermediate"},
            {"name": "Doji types: standard, dragonfly, and gravestone doji and their contextual interpretations", "difficulty": "beginner"},
            {"name": "Harami patterns: bullish and bearish inside-candle reversal signals", "difficulty": "intermediate"},
            {"name": "Three white soldiers and three black crows: multi-candle momentum reversal signals", "difficulty": "intermediate"},
        ],
    },
    "support_resistance": {
        "questions_per_subtopic": 5,
        "sources": [
            "Murphy - Technical Analysis of Financial Markets",
            "Weinstein - Secrets for Profiting in Bull and Bear Markets",
        ],
        "subtopics": [
            {"name": "Psychological round numbers: why prices like $50, $100, and $200 act as natural support and resistance", "difficulty": "beginner"},
            {"name": "Moving averages as dynamic support: the roles of the 21 EMA, 50 MA, and 200 MA as moving levels", "difficulty": "beginner"},
            {"name": "Fibonacci retracements: using 38.2%, 50%, and 61.8% pullback levels as support and resistance zones", "difficulty": "intermediate"},
            {"name": "Gap fill levels: how unfilled gaps create support or resistance on the chart", "difficulty": "intermediate"},
            {"name": "Prior base highs as future support: why the top of a prior base becomes support after a breakout", "difficulty": "intermediate"},
            {"name": "Support confluence: when multiple support types align at the same price level", "difficulty": "advanced"},
            {"name": "Weekly chart support levels: why weekly chart support and resistance carries more weight than daily", "difficulty": "intermediate"},
        ],
    },
    "channels": {
        "questions_per_subtopic": 4,
        "sources": [
            "Murphy - Technical Analysis of Financial Markets",
        ],
        "subtopics": [
            {"name": "Channel midline as pivot: using the midpoint between channel lines as intermediate support/resistance", "difficulty": "intermediate"},
            {"name": "Trading descending channel shorts: identifying short entries near the upper line of a descending channel", "difficulty": "advanced"},
            {"name": "Horizontal channel (trading range): buying the channel floor and selling the ceiling in a range-bound market", "difficulty": "beginner"},
            {"name": "Channel width and implied volatility: what a widening or narrowing channel signals about future moves", "difficulty": "intermediate"},
            {"name": "False channel breaks: how to distinguish a genuine breakout from a temporary violation of channel lines", "difficulty": "advanced"},
        ],
    },
    # ── New categories ────────────────────────────────────────────────────────
    "technical_indicators": {
        "questions_per_subtopic": 5,
        "sources": [
            "Murphy - Technical Analysis of Financial Markets",
            "Wilder - New Concepts in Technical Trading Systems",
        ],
        "subtopics": [
            {"name": "RSI overbought and oversold: when the 70/30 levels matter and when an extended RSI reflects a strong trend", "difficulty": "beginner"},
            {"name": "RSI divergence: identifying bullish and bearish divergence between RSI and price", "difficulty": "intermediate"},
            {"name": "RSI failure swings and the 50 centerline: using internal RSI structure to confirm trend strength", "difficulty": "advanced"},
            {"name": "MACD signal line crossovers and zero-line crossovers: timing entries and exits", "difficulty": "beginner"},
            {"name": "MACD histogram divergence: using histogram momentum shifts as early warning of trend reversals", "difficulty": "intermediate"},
            {"name": "Bollinger Band squeeze: low-volatility compression preceding a high-probability expansion move", "difficulty": "intermediate"},
            {"name": "VWAP as intraday support and resistance: how swing traders use VWAP to assess intraday strength", "difficulty": "intermediate"},
            {"name": "OBV trend confirmation and divergence: using on-balance volume to confirm or question a price trend", "difficulty": "intermediate"},
            {"name": "Stochastics: overbought/oversold levels and %K/%D crossovers as trade signals", "difficulty": "beginner"},
            {"name": "Indicator confluence and contradiction: how to handle multiple indicators that agree vs conflict", "difficulty": "advanced"},
        ],
    },
    "market_internals": {
        "questions_per_subtopic": 5,
        "sources": [
            "O'Neil - How to Make Money in Stocks",
            "Murphy - Technical Analysis of Financial Markets",
        ],
        "subtopics": [
            {"name": "Advance/decline line: using market breadth to confirm or question the health of a market rally", "difficulty": "intermediate"},
            {"name": "New 52-week highs vs lows ratio: measuring market leadership breadth", "difficulty": "intermediate"},
            {"name": "VIX interpretation: what extreme fear and extreme complacency readings signal about market direction", "difficulty": "intermediate"},
            {"name": "Put/call ratio: using options market sentiment as a contrarian signal at extremes", "difficulty": "advanced"},
            {"name": "Distribution day count: how to track distribution days and when the count signals market trouble", "difficulty": "intermediate"},
            {"name": "Follow-through day: confirming a new market uptrend before committing capital to new swing positions", "difficulty": "intermediate"},
            {"name": "Sector rotation cycle: which sectors lead and lag at different stages of the economic cycle", "difficulty": "advanced"},
            {"name": "Relative sector strength: how to identify the strongest and weakest sectors in real time", "difficulty": "intermediate"},
            {"name": "Index divergence: what it means when small-cap indices diverge from large-cap indices", "difficulty": "advanced"},
            {"name": "Market trend confirmation: how to definitively classify the market as uptrend, correction, or downtrend", "difficulty": "beginner"},
        ],
    },
    "short_selling": {
        "questions_per_subtopic": 5,
        "sources": [
            "Minervini - Trade Like a Stock Market Wizard",
            "O'Neil - How to Make Money in Stocks",
        ],
        "subtopics": [
            {"name": "Short selling mechanics: how to locate shares to borrow, margin requirements, and the cost of short interest", "difficulty": "beginner"},
            {"name": "Failed breakout as a short setup: when a stock breaks out and fails within 1-2 days as a short-entry trigger", "difficulty": "intermediate"},
            {"name": "Head and shoulders top: identifying the pattern and timing the short entry at the neckline break", "difficulty": "intermediate"},
            {"name": "Climax top and extended stock shorting: how to identify a parabolic move nearing exhaustion", "difficulty": "advanced"},
            {"name": "Short squeeze mechanics: what causes them and how to identify squeeze risk before entering a short", "difficulty": "intermediate"},
            {"name": "Stop placement and covering rules for short positions: where to stop out and when to cover", "difficulty": "intermediate"},
            {"name": "Downtrend context: why short selling has highest probability in Stage 3 and Stage 4 stocks", "difficulty": "beginner"},
            {"name": "Risk/reward asymmetry: maximum gain on a short is 100%, potential loss is unlimited", "difficulty": "intermediate"},
        ],
    },
    "gap_trading": {
        "questions_per_subtopic": 5,
        "sources": [
            "Murphy - Technical Analysis of Financial Markets",
            "Bulkowski - Getting Started in Chart Patterns",
        ],
        "subtopics": [
            {"name": "Gap classification: how to identify common, breakaway, continuation, and exhaustion gaps from context", "difficulty": "beginner"},
            {"name": "Gap fill probability: which gap types tend to fill and which tend not to fill", "difficulty": "intermediate"},
            {"name": "Earnings gap plays: when to trade a gap-and-go vs when to fade an earnings gap", "difficulty": "advanced"},
            {"name": "Gap-up entry rules: how to buy a stock that gaps above your planned entry without chasing", "difficulty": "intermediate"},
            {"name": "Gap-down response: when to hold through a gap-down on an existing position vs exit immediately", "difficulty": "intermediate"},
            {"name": "Pre-market gap assessment: evaluating gap significance using pre-market volume before the open", "difficulty": "intermediate"},
            {"name": "Gaps at support and resistance: how a gap occurring at a key level amplifies its significance", "difficulty": "intermediate"},
            {"name": "Failed gap reversals: when a gap-up closes below the gap level on the same day as a bearish signal", "difficulty": "advanced"},
        ],
    },
}
