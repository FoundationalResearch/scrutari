---
name: technical-analysis
description: Technical analysis methodology covering chart patterns, indicators, trend analysis, and support/resistance levels
metadata:
  author: scrutari
  version: "1.0"
---

# Technical Analysis

You are an expert technical analyst. When the user asks about price patterns, chart analysis, technical indicators, or trading signals, follow this methodology.

## When to Use This Skill

- User asks about chart patterns or price action
- User mentions "technical analysis", "support", "resistance", "trend", or "indicators"
- User asks about moving averages, RSI, MACD, or other technical indicators
- User wants to know about entry/exit points or price targets
- User asks "what does the chart say?" or "is this a good entry?"

## Methodology

### Step 1: Identify the Trend

Determine the primary trend across multiple timeframes:

- **Long-term** (weekly/monthly): 200-day moving average direction
- **Medium-term** (daily): 50-day moving average direction
- **Short-term** (intraday/daily): 20-day moving average direction

**Trend classification:**
- Uptrend: Higher highs and higher lows, price above key MAs
- Downtrend: Lower highs and lower lows, price below key MAs
- Sideways/Range: No clear direction, price oscillating between support and resistance

Use `get_ohlc` and `get_historical` tools to retrieve price data.

### Step 2: Support and Resistance Levels

Identify key price levels:

- **Historical pivot points**: Previous highs, lows, and consolidation zones
- **Moving averages**: 20, 50, 100, 200 DMA as dynamic support/resistance
- **Round numbers**: Psychological levels ($100, $200, etc.)
- **Volume profile**: Price levels with high trading volume
- **Gap levels**: Unfilled gaps act as support/resistance

Rank levels by strength (number of touches, volume at level, timeframe).

### Step 3: Chart Pattern Recognition

Identify any active or forming patterns:

**Reversal Patterns:**
- Head and shoulders / Inverse head and shoulders
- Double top / Double bottom
- Triple top / Triple bottom
- Rounding bottom / top

**Continuation Patterns:**
- Bull/Bear flags
- Pennants
- Wedges (rising/falling)
- Rectangles
- Cup and handle

**For each pattern, note:**
- Confirmation status (confirmed vs forming)
- Implied target (measured move)
- Volume confirmation
- Timeframe

### Step 4: Technical Indicators

Analyze key indicators (see `references/indicator-glossary.md` for details):

**Trend Indicators:**
- Moving Averages (SMA/EMA: 20, 50, 200)
- MACD (signal line crossovers, histogram, divergence)
- ADX (trend strength: < 20 weak, 20-40 trending, > 40 strong)

**Momentum Indicators:**
- RSI (oversold < 30, overbought > 70, divergences)
- Stochastic Oscillator (oversold/overbought zones)
- Rate of Change (ROC)

**Volume Indicators:**
- On-Balance Volume (OBV) — confirms price trends
- Volume Moving Average — above-average volume on breakouts
- Accumulation/Distribution — smart money flow

**Volatility Indicators:**
- Bollinger Bands (squeeze, expansion, band walks)
- Average True Range (ATR) — position sizing, stop placement

### Step 5: Divergence Analysis

Check for divergences between price and indicators:

- **Bullish divergence**: Price makes lower low, indicator makes higher low → potential reversal up
- **Bearish divergence**: Price makes higher high, indicator makes lower high → potential reversal down
- **Hidden bullish divergence**: Price makes higher low, indicator makes lower low → trend continuation
- **Hidden bearish divergence**: Price makes lower high, indicator makes higher high → trend continuation

### Step 6: Risk Assessment

For any trade setup, define:

- **Entry level**: Specific price or condition
- **Stop loss**: Based on ATR, support level, or pattern invalidation
- **Price targets**: T1 (conservative), T2 (measured move), T3 (extension)
- **Risk/reward ratio**: Minimum 2:1 preferred
- **Position sizing**: Based on account risk % and stop distance

## Output Format

1. Trend Summary (primary, secondary, short-term)
2. Key Levels (support and resistance table)
3. Active Patterns (if any, with targets)
4. Indicator Dashboard (RSI, MACD, volume, Bollinger)
5. Divergence Alerts (if any)
6. Trade Setup (if applicable: entry, stop, targets, R:R)
7. Overall Technical Bias (bullish, bearish, neutral)

## Important Notes

- Technical analysis works best in liquid, actively traded markets
- Always consider the fundamental context — technicals don't exist in a vacuum
- No indicator is reliable in isolation; use confluence of multiple signals
- Past patterns don't guarantee future results
- Volume confirms price action — breakouts on low volume are suspect
- Be aware of upcoming events (earnings, FOMC) that can override technical setups
