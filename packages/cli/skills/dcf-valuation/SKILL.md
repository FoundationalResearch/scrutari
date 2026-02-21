---
name: dcf-valuation
description: DCF valuation methodology covering revenue projections, WACC calculation, and terminal value estimation
metadata:
  author: scrutari
  version: "1.0"
---

# DCF Valuation

You are an expert financial analyst specializing in discounted cash flow valuations. When the user asks you to value a company or estimate intrinsic value, follow this methodology.

## When to Use This Skill

- User asks to value a company or estimate fair value
- User mentions "DCF", "intrinsic value", "discounted cash flow", or "valuation"
- User asks "what is X worth?" or "is X overvalued/undervalued?"
- User wants to model future cash flows

## Co-located Pipeline

This skill has a co-located pipeline (`dcf-valuation.pipeline.yaml`) that can automate the data gathering and calculation stages. Consider running it for a structured, end-to-end DCF analysis.

## Methodology

### Step 1: Gather Historical Financials

Collect at least 3-5 years of historical data:

- Revenue and revenue growth rates
- EBITDA and EBITDA margins
- Capital expenditures
- Depreciation and amortization
- Changes in working capital
- Tax rate (effective)
- Current debt and equity structure

Use `get_financials` and `search_filings` tools to retrieve this data.

### Step 2: Revenue Projections (5-10 Year Forecast)

Build a revenue model considering:

- **Historical growth rates**: 3-year and 5-year CAGR
- **Industry growth**: TAM expansion, market share dynamics
- **Company-specific drivers**: New products, geographic expansion, pricing power
- **Consensus estimates**: Use as a sanity check, not as the projection
- **Scenario analysis**: Bull, base, and bear cases

Revenue projection guidelines:
- Year 1-2: Closest to consensus, adjusted for your view
- Year 3-5: Converge toward industry growth rates
- Year 6-10: Gradually approach terminal growth rate

### Step 3: Free Cash Flow Build

For each projected year, calculate unlevered free cash flow (UFCF):

```
UFCF = EBIT × (1 - Tax Rate)
     + Depreciation & Amortization
     - Capital Expenditures
     - Change in Working Capital
```

Key assumptions to document:
- EBITDA margin trajectory (expansion, stable, compression)
- CapEx as % of revenue (maintenance vs growth)
- Working capital as % of revenue change
- Tax rate assumptions

### Step 4: WACC Calculation

Calculate the weighted average cost of capital (see `references/wacc-guide.md` for details):

```
WACC = (E/V) × Re + (D/V) × Rd × (1 - T)
```

Where:
- **Re** (Cost of Equity) = Risk-free rate + Beta × Equity risk premium
- **Rd** (Cost of Debt) = Yield on existing debt or comparable credit spread
- **E/V** = Equity weight (market cap / enterprise value)
- **D/V** = Debt weight (net debt / enterprise value)
- **T** = Marginal tax rate

Typical WACC ranges:
- Large-cap, stable: 7-9%
- Mid-cap, moderate risk: 9-12%
- Small-cap, high growth: 12-16%
- Early stage / high risk: 15-25%

### Step 5: Terminal Value

Calculate terminal value using one or both methods:

**Gordon Growth Model (preferred):**
```
TV = FCF(n+1) / (WACC - g)
```
Where g = terminal growth rate (typically 2-3%, should not exceed long-term GDP growth)

**Exit Multiple Method (sanity check):**
```
TV = EBITDA(n) × Exit EV/EBITDA Multiple
```
Use industry-average forward multiples, typically 8-15x depending on sector.

Terminal value usually represents 60-80% of total enterprise value. If it exceeds 85%, your explicit forecast period may be too short.

### Step 6: Discount and Sum

1. Discount each year's UFCF and terminal value back to present at WACC
2. Sum to get Enterprise Value (EV)
3. Bridge to equity value:

```
Equity Value = Enterprise Value
             - Net Debt
             - Minority Interest
             - Preferred Stock
             + Cash & Equivalents
             + Equity Investments

Implied Share Price = Equity Value / Diluted Shares Outstanding
```

### Step 7: Sensitivity Analysis

Always present a sensitivity table showing implied share price across:

- **WACC**: ±1-2% from base case (rows)
- **Terminal growth rate**: ±0.5-1% from base case (columns)

This shows the range of reasonable valuations and highlights which assumptions matter most.

### Step 8: Sanity Checks

Validate your DCF output:

- **Implied multiples**: Does the DCF-implied EV/EBITDA or P/E make sense vs peers?
- **Implied growth**: Is the implied revenue CAGR realistic?
- **FCF yield**: Is the implied FCF yield reasonable for the risk profile?
- **Terminal value %**: Is it 60-80% of total EV (typical range)?

## Output Format

1. Key Assumptions Table
2. Revenue and FCF Projections (yearly table)
3. WACC Calculation Breakdown
4. Terminal Value (both methods)
5. DCF Summary (EV → Equity Value → Implied Price)
6. Sensitivity Table (WACC vs Terminal Growth)
7. Bull/Base/Bear Scenario Summary
8. Key Risks to the Valuation

## Important Notes

- Always state your assumptions explicitly — a DCF is only as good as its inputs
- Present a range, not a point estimate
- Compare your DCF result to current market price and trading multiples
- Acknowledge model limitations (especially for unprofitable or high-growth companies)
- For companies with negative cash flow, consider using a revenue multiple or adjusted DCF approach
