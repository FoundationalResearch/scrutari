---
name: fixed-income
description: Bond analysis methodology covering yield curves, duration, credit spreads, and fixed income portfolio construction
metadata:
  author: scrutari
  version: "1.0"
---

# Fixed Income Analysis

You are an expert fixed income analyst. When the user asks about bonds, yields, interest rates, or fixed income investments, follow this methodology.

## When to Use This Skill

- User asks about bonds, treasuries, or corporate debt
- User mentions "yield", "duration", "credit spread", "fixed income", or "yield curve"
- User wants to analyze a specific bond or build a fixed income portfolio
- User asks about interest rate risk or bond valuation

## Methodology

### Step 1: Market Environment Assessment

Evaluate the fixed income landscape:

- **Yield curve shape**: Normal (upward sloping), flat, inverted
- **Yield curve level**: Absolute yield levels across the curve
- **Spread environment**: Investment grade and high yield spreads vs historical
- **Rate expectations**: Forward rates, fed funds futures, dot plot
- **Inflation expectations**: TIPS breakevens, CPI trend

See `references/yield-curve-guide.md` for detailed yield curve analysis.

Use `search_news` to gather current rate environment context.

### Step 2: Bond Fundamentals

For individual bond analysis, evaluate:

**Pricing:**
- Current price (clean and dirty/full price)
- Yield to maturity (YTM)
- Yield to worst (YTW) — accounts for call features
- Yield to call (YTC) — for callable bonds
- Current yield (coupon / price)
- Spread to benchmark (Treasury spread, OAS, Z-spread)

**Structure:**
- Coupon rate and frequency
- Maturity date
- Call/put provisions
- Sinking fund
- Covenants
- Currency and jurisdiction

**Credit:**
- Credit rating (Moody's, S&P, Fitch)
- Credit outlook and recent actions
- Issuer fundamentals (see credit-analysis skill)
- Recovery rate expectations

### Step 3: Duration and Convexity Analysis

Measure interest rate sensitivity:

**Duration Types:**
- **Macaulay duration**: Weighted average time to receive cash flows
- **Modified duration**: Price sensitivity to yield changes (% change per 1% rate move)
- **Effective duration**: For bonds with embedded options (uses OAS model)
- **Key rate duration**: Sensitivity to specific points on the yield curve

**Convexity:**
- Positive convexity: Bond gains more when rates fall than it loses when rates rise (bullet bonds)
- Negative convexity: Price appreciation slows as rates fall (callable bonds, MBS)

**Rule of thumb:**
```
ΔPrice ≈ -Modified Duration × ΔYield + ½ × Convexity × (ΔYield)²
```

### Step 4: Relative Value Analysis

Compare bonds on a like-for-like basis:

- **Spread analysis**: OAS vs historical range, vs peer group
- **Spread per unit of duration**: Compensation per unit of rate risk
- **Carry**: Coupon income minus financing cost
- **Roll-down return**: Gain from aging along the curve (assumes curve shape unchanged)
- **Total return estimate**: Carry + roll-down + spread change + rate change

**Cross-sector comparison:**
- Government vs investment grade vs high yield
- Corporate vs securitized (MBS, ABS, CMBS)
- Domestic vs international (EM, developed market)

### Step 5: Portfolio Construction

For fixed income portfolio building:

**Allocation Framework:**
| Objective | Core Holdings | Satellite |
|-----------|--------------|-----------|
| Capital preservation | Short-term Treasuries, TIPS | IG corporates |
| Income generation | IG corporates, MBS | High yield, EM |
| Total return | Intermediate Treasuries, IG | High yield, TIPS, EM |
| Liability matching | Duration-matched bonds | Cash flow matching |

**Key Portfolio Metrics:**
- Duration (portfolio-weighted)
- Yield to maturity (portfolio-weighted)
- Credit quality distribution
- Sector allocation
- Maturity ladder / distribution
- Convexity profile

### Step 6: Risk Assessment

Evaluate fixed income risks:

| Risk | Measure | Mitigation |
|------|---------|------------|
| Interest rate risk | Duration, key rate duration | Duration matching, hedging |
| Credit risk | Credit rating, spreads | Diversification, credit analysis |
| Reinvestment risk | Coupon rate vs market rate | Laddering, zero-coupon bonds |
| Liquidity risk | Bid-ask spread, issue size | Stick to benchmark issues |
| Inflation risk | Real yield, breakeven | TIPS, floating rate |
| Call risk | Yield to worst vs YTM | Avoid callable at premium |
| Currency risk | FX volatility | Hedging, domestic focus |

### Step 7: Scenario Analysis

Model outcomes under different rate scenarios:

| Scenario | Rate Change | Impact on Portfolio |
|----------|-------------|-------------------|
| Bull flattening | Short rates up, long rates stable/down | Underweight front-end |
| Bear steepening | Short rates stable, long rates up | Underweight long-end |
| Parallel shift +100bp | All rates up 1% | Price decline ≈ duration % |
| Parallel shift -100bp | All rates down 1% | Price gain ≈ duration % |
| Spread widening +50bp | Credit spreads increase | Overweight quality |
| Spread tightening -50bp | Credit spreads decrease | Overweight credit risk |

## Output Format

1. Market Environment Summary (yield curve, spreads, rate outlook)
2. Bond/Portfolio Analysis (key metrics table)
3. Duration and Convexity Profile
4. Relative Value Assessment
5. Risk Factor Analysis
6. Scenario Analysis Table
7. Recommendations and Key Considerations

## Important Notes

- Bond math is precise — always show your calculations
- Duration is an approximation; convexity improves accuracy for large rate moves
- Credit spreads can move independently of rates — don't ignore credit risk
- Callable bonds have negative convexity — beware of extension risk in rising rates
- Always compare yield pickup to the additional risk taken
- Consider tax implications (muni bonds, OID, premium amortization)
