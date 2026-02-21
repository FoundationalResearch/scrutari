# Yield Curve Analysis Guide

## Yield Curve Shapes

### Normal (Upward Sloping)
- Short-term rates < Long-term rates
- Most common shape
- Reflects term premium (compensation for holding longer maturities)
- Indicates economic expansion expected

### Flat
- Short-term rates ≈ Long-term rates
- Often a transitional phase
- Can signal economic uncertainty
- Common during Fed tightening cycles (late cycle)

### Inverted
- Short-term rates > Long-term rates
- Historically reliable recession predictor (2y-10y inversion)
- Market expects rate cuts (economic slowdown)
- **Track record**: Inverted before every US recession since 1970

### Humped
- Intermediate rates > Both short and long rates
- Less common, usually transitional
- Can signal peak of tightening cycle

## Key Spread Measures

| Spread | Definition | What It Signals |
|--------|-----------|-----------------|
| 2y-10y | 10yr Treasury - 2yr Treasury | Most watched slope; recession signal when negative |
| 3m-10y | 10yr Treasury - 3m T-bill | Fed's preferred recession indicator |
| 5y-30y | 30yr Treasury - 5yr Treasury | Long-end term premium |
| TED spread | 3m LIBOR - 3m T-bill | Banking system stress |
| IG OAS | Investment grade option-adjusted spread | Corporate credit conditions |
| HY OAS | High yield option-adjusted spread | Risk appetite |
| Breakeven | Nominal yield - TIPS yield | Inflation expectations |

## Yield Curve Movements

### Parallel Shift
- Entire curve moves up or down by same amount
- Driven by broad rate expectations or Fed action
- Impact: Duration × ΔYield

### Steepening
**Bull steepening**: Short rates fall more than long rates
- Caused by: Fed cutting rates, economic weakness
- Favors: Long duration, receive fixed in swaps

**Bear steepening**: Long rates rise more than short rates
- Caused by: Inflation expectations, fiscal deficits, term premium increase
- Favors: Short duration, floating rate

### Flattening
**Bull flattening**: Long rates fall more than short rates
- Caused by: Flight to quality, expected slowdown
- Favors: Long duration (price appreciation)

**Bear flattening**: Short rates rise more than long rates
- Caused by: Fed hiking rates
- Favors: Short duration, money markets

### Twist / Butterfly
- Non-parallel movement (e.g., short and long rates move differently from intermediate)
- Captured by key rate duration analysis
- Requires more sophisticated positioning

## Term Premium

The extra yield investors demand for holding longer-term bonds:

```
Nominal Yield = Expected Path of Short Rates + Term Premium
```

**Factors affecting term premium:**
- Inflation uncertainty (higher → more term premium)
- Supply/demand (more issuance → more term premium)
- Central bank balance sheet (QE reduces term premium)
- Safe haven demand (flight to quality reduces term premium)
- Volatility regime (higher vol → more term premium)

**Current state**: Track the ACM (Adrian, Crump, Moench) or KW (Kim-Wright) term premium models from the NY Fed.

## Yield Curve Strategies

| Strategy | View | Implementation |
|----------|------|---------------|
| Bullet | Rates stable, carry play | Concentrate around target maturity |
| Barbell | Curve to flatten or steepen | Weight short + long, underweight middle |
| Ladder | Neutral, reinvestment management | Equal weights across maturities |
| Roll-down | Steep curve, stable shape | Buy on steep part, hold as it rolls down |
| Curve trade | Specific slope view | 2s10s flattener/steepener |

## Historical Yield Curve Benchmarks

| Metric | Historical Average | Range |
|--------|-------------------|-------|
| 2y-10y spread | +100-150bp | -100bp to +300bp |
| 3m-10y spread | +150-200bp | -50bp to +400bp |
| 10y Treasury | ~4.0% (long-term) | 0.5% to 16% |
| IG OAS | ~120bp | 50bp to 600bp+ |
| HY OAS | ~400bp | 250bp to 2000bp+ |
| 10y breakeven | ~2.2% | 0.5% to 3.0% |
