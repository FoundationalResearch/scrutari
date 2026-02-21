# Technical Indicator Glossary

## Moving Averages

### Simple Moving Average (SMA)
- **Calculation**: Average of closing prices over N periods
- **Common periods**: 20 (short-term), 50 (medium-term), 200 (long-term)
- **Signal**: Price above MA = bullish, below = bearish
- **Golden Cross**: 50 SMA crosses above 200 SMA (bullish)
- **Death Cross**: 50 SMA crosses below 200 SMA (bearish)

### Exponential Moving Average (EMA)
- **Calculation**: Weighted average giving more weight to recent prices
- **Advantage**: Reacts faster to price changes than SMA
- **Common use**: 12 and 26 EMA (used in MACD), 9 EMA (signal line)

## Momentum Indicators

### Relative Strength Index (RSI)
- **Range**: 0-100
- **Overbought**: > 70 (potential pullback)
- **Oversold**: < 30 (potential bounce)
- **Best use**: Divergence detection, mean reversion in ranges
- **Period**: 14 (default)

### MACD (Moving Average Convergence Divergence)
- **Components**: MACD line (12 EMA - 26 EMA), Signal line (9 EMA of MACD), Histogram
- **Bullish signal**: MACD crosses above signal line
- **Bearish signal**: MACD crosses below signal line
- **Divergence**: MACD vs price divergence signals potential reversal
- **Zero line**: MACD above zero = bullish momentum

### Stochastic Oscillator
- **Range**: 0-100
- **%K**: Fast line (14-period default)
- **%D**: Slow line (3-period SMA of %K)
- **Overbought**: > 80
- **Oversold**: < 20
- **Signal**: %K crossing %D

### Average Directional Index (ADX)
- **Range**: 0-100
- **< 20**: Weak trend (range-bound, use oscillators)
- **20-40**: Developing or moderate trend
- **> 40**: Strong trend (use trend-following strategies)
- **> 60**: Very strong trend (rare)
- **Components**: +DI (bullish), -DI (bearish), ADX (trend strength)

## Volume Indicators

### On-Balance Volume (OBV)
- **Calculation**: Running total — adds volume on up days, subtracts on down days
- **Use**: Confirm trends — OBV rising with price = healthy trend
- **Divergence**: OBV diverging from price signals potential reversal

### Volume Moving Average
- **Typical period**: 20-day
- **Breakout confirmation**: Volume > 1.5x average on breakout
- **Climactic volume**: Extremely high volume can signal exhaustion

## Volatility Indicators

### Bollinger Bands
- **Components**: Middle band (20 SMA), Upper/Lower bands (±2 standard deviations)
- **Squeeze**: Bands narrow → low volatility → expect breakout
- **Expansion**: Bands widen → high volatility → trend in progress
- **Band walk**: Price riding upper/lower band = strong trend
- **Mean reversion**: Price touching outer band in range → expect reversion

### Average True Range (ATR)
- **Period**: 14 (default)
- **Use**: Measure volatility, set stop losses
- **Stop loss**: Typically 1.5-2x ATR below entry (long) or above (short)
- **Position sizing**: Risk amount ÷ (ATR × multiplier) = shares

## Fibonacci Levels

### Retracement Levels
| Level | Use |
|-------|-----|
| 23.6% | Shallow pullback in strong trend |
| 38.2% | Moderate pullback, common support |
| 50.0% | Not a Fib number, but widely watched |
| 61.8% | Deep pullback, "golden ratio", key decision level |
| 78.6% | Last defense before full retracement |

### Extension Levels
| Level | Use |
|-------|-----|
| 127.2% | First profit target |
| 161.8% | Common measured move target |
| 261.8% | Extended target in strong trends |

## Candlestick Patterns (Key Ones)

| Pattern | Type | Signal |
|---------|------|--------|
| Doji | Single | Indecision, potential reversal |
| Hammer | Single | Bullish reversal (at bottom) |
| Shooting Star | Single | Bearish reversal (at top) |
| Engulfing (Bull) | Double | Bullish reversal |
| Engulfing (Bear) | Double | Bearish reversal |
| Morning Star | Triple | Bullish reversal |
| Evening Star | Triple | Bearish reversal |
