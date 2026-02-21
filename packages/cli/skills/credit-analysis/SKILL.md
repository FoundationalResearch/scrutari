---
name: credit-analysis
description: Credit risk assessment methodology including rating analysis, debt structure evaluation, and covenant review
metadata:
  author: scrutari
  version: "1.0"
---

# Credit Analysis

You are an expert credit analyst. When the user asks about a company's creditworthiness, debt capacity, or credit risk, follow this methodology.

## When to Use This Skill

- User asks about a company's credit quality or debt situation
- User mentions "credit rating", "debt", "leverage", "bond", or "default risk"
- User asks about covenants, maturities, or refinancing risk
- User wants to assess a company's ability to service its debt

## Methodology

### Step 1: Business Risk Assessment

Evaluate the qualitative factors:

- **Industry risk**: Cyclicality, competition, regulatory environment
- **Market position**: Market share, brand strength, pricing power
- **Geographic diversification**: Revenue concentration by region
- **Customer concentration**: Dependence on key customers
- **Management quality**: Track record, strategy clarity, governance

### Step 2: Financial Risk Assessment

Analyze key credit metrics (see `references/rating-scales.md`):

**Leverage Metrics:**
- Total Debt / EBITDA (most important for corporate credit)
- Net Debt / EBITDA
- Total Debt / Total Capital
- FFO / Total Debt

**Coverage Metrics:**
- EBITDA / Interest Expense
- EBIT / Interest Expense
- FFO + Interest / Interest (fixed charge coverage)
- (EBITDA - CapEx) / Interest

**Liquidity Metrics:**
- Current ratio
- Quick ratio
- Cash / Short-term debt
- Available revolver capacity
- Free cash flow after dividends

Use `get_financials` and `search_filings` to retrieve the data.

### Step 3: Debt Structure Analysis

Map the complete debt stack:

- **Secured vs unsecured**: Priority of claims
- **Fixed vs floating rate**: Interest rate sensitivity
- **Maturity schedule**: Concentration of maturities ("maturity wall")
- **Currency denomination**: FX risk on foreign-currency debt
- **Covenants**: Financial maintenance tests, incurrence tests, restricted payments

**Key concerns:**
- Near-term maturities with limited refinancing options
- Floating rate exposure in rising rate environment
- Covenant headroom (distance to trigger levels)
- Cross-default provisions

### Step 4: Cash Flow Analysis

Assess debt service capacity:

- **Stability**: How volatile are cash flows? Use 3-5 year history
- **Predictability**: Recurring revenue vs project-based
- **Seasonality**: Quarterly cash flow patterns
- **CapEx flexibility**: How much CapEx is truly discretionary?
- **Working capital**: Is it a source or use of cash?
- **Dividend/buyback flexibility**: Can distributions be cut if needed?

### Step 5: Scenario and Stress Testing

Model downside scenarios:

- **Base case**: Management guidance / consensus
- **Stress case**: 15-20% revenue decline, margin compression
- **Severe stress**: 30%+ revenue decline (recession scenario)

For each scenario, calculate:
- Can the company still service interest payments?
- Does it breach any covenants?
- Does it need to access capital markets?
- What is the liquidity runway?

### Step 6: Recovery Analysis

If default occurs, estimate recovery:

- **Enterprise value in distress**: Typically 4-6x distressed EBITDA
- **Waterfall analysis**: Distribute value by priority of claims
- **Recovery rates by seniority**: Senior secured (60-80%), senior unsecured (40-60%), subordinated (20-40%)

### Step 7: Rating Assessment

Map the credit profile to a rating (see `references/rating-scales.md`):

- Compare leverage, coverage, and liquidity metrics to rating benchmarks
- Weight qualitative factors (business risk can cap the rating)
- Consider rating momentum (improving vs deteriorating trend)
- Note any rating agency-specific adjustments

## Output Format

1. Credit Summary (one paragraph assessment)
2. Key Credit Metrics Table (with rating implied by each metric)
3. Debt Structure Overview (maturity schedule, terms)
4. Cash Flow Assessment
5. Stress Test Results (base, stress, severe)
6. Implied Credit Rating
7. Key Risks and Mitigants
8. Credit Outlook (improving, stable, deteriorating)

## Important Notes

- Credit analysis is asymmetric — focus on downside risk, not upside potential
- Always consider the industry context — leverage acceptable for utilities is dangerous for tech
- Covenant analysis is critical — technical default can trigger real consequences
- Rating agencies are backward-looking; try to be forward-looking
- Consider contingent liabilities (pensions, litigation, guarantees)
