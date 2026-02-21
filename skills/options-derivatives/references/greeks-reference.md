# Options Greeks Reference

## Delta (Δ)

**What it measures**: Change in option price for $1 change in underlying price

| Position | Delta Range | Interpretation |
|----------|------------|----------------|
| Long call | 0 to +1.0 | ATM ≈ 0.50, ITM > 0.50, OTM < 0.50 |
| Long put | -1.0 to 0 | ATM ≈ -0.50, ITM < -0.50, OTM > -0.50 |
| Short call | -1.0 to 0 | Opposite of long call |
| Short put | 0 to +1.0 | Opposite of long put |

**Uses:**
- Directional exposure: 100 shares = delta of 1.0
- Hedge ratio: Number of shares to hedge = |delta| × 100
- Probability proxy: |delta| ≈ probability of expiring ITM

## Gamma (Γ)

**What it measures**: Rate of change of delta for $1 change in underlying

- **Highest**: At-the-money options near expiration
- **Lowest**: Deep ITM or OTM options, long-dated options
- **Long options**: Positive gamma (delta moves in your favor)
- **Short options**: Negative gamma (delta moves against you)

**Gamma risk**: Short gamma positions can experience rapid loss acceleration. Most dangerous near expiration for ATM strikes.

## Theta (Θ)

**What it measures**: Dollar value lost per day due to time decay

- **Always negative** for long options (time works against you)
- **Always positive** for short options (time works for you)
- **Accelerates**: Theta increases as expiration approaches
- **ATM options**: Highest theta decay
- **Rule of thumb**: Option loses ~1/3 of time value in last 1/3 of its life

**Theta by DTE:**
| Days to Expiration | Theta Behavior |
|--------------------|---------------|
| > 60 DTE | Slow, gradual decay |
| 30-60 DTE | Moderate decay |
| 15-30 DTE | Accelerating decay |
| < 15 DTE | Rapid decay |
| < 7 DTE | Very rapid, especially ATM |

## Vega (ν)

**What it measures**: Change in option price for 1% change in implied volatility

- **Long options**: Positive vega (benefit from IV increase)
- **Short options**: Negative vega (benefit from IV decrease)
- **Longest-dated options**: Highest vega
- **ATM options**: Highest vega for a given expiration

**Vega and Strategy Selection:**
| IV Environment | Preferred Strategies |
|----------------|---------------------|
| Low IV (buy premium) | Long calls/puts, straddles, calendars |
| High IV (sell premium) | Iron condors, credit spreads, strangles |
| Rising IV | Long vega positions |
| Falling IV | Short vega positions |

## Rho (ρ)

**What it measures**: Change in option price for 1% change in interest rates

- Usually the least important Greek
- More significant for longer-dated options (LEAPS)
- Calls have positive rho (benefit from rate increases)
- Puts have negative rho (benefit from rate decreases)

## Combined Greeks Profiles

### Common Strategy Greeks

| Strategy | Delta | Gamma | Theta | Vega |
|----------|-------|-------|-------|------|
| Long call | + | + | - | + |
| Short call | - | - | + | - |
| Long put | - | + | - | + |
| Short put | + | - | + | - |
| Bull call spread | + (reduced) | ≈ 0 | ≈ 0 | ≈ 0 |
| Long straddle | ≈ 0 | + | - | + |
| Short straddle | ≈ 0 | - | + | - |
| Iron condor | ≈ 0 | - | + | - |
| Calendar spread | ≈ 0 | - (near) | + (net) | + |
| Covered call | + (reduced) | - | + | - |
| Protective put | + (reduced) | + | - | + |

## Position Sizing with Greeks

### Delta-Based Sizing
- Want 100 delta exposure? Buy 2 ATM calls (delta ≈ 50 each)
- Each contract controls 100 shares
- Portfolio delta = Σ (position delta × contracts × 100)

### Theta-Based Sizing (for income strategies)
- Target daily theta as % of capital at risk
- Example: $500/day theta on $50,000 portfolio = 1% daily
- Don't exceed 50% of max profit as theta target

### Vega-Based Risk
- Know your portfolio vega exposure before earnings/events
- A 10-point IV crush on 100 vega = $1,000 impact
- Balance long and short vega if seeking theta only
