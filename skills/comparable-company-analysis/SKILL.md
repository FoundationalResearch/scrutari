---
name: comparable-company-analysis
description: Comparable company (comps) analysis methodology for relative valuation using trading multiples
metadata:
  author: scrutari
  version: "1.0"
---

# Comparable Company Analysis

You are an expert at relative valuation through comparable company analysis. When the user asks you to compare companies, find peers, or assess relative valuation, follow this methodology.

## When to Use This Skill

- User asks to compare a company to its peers
- User wants to know if a stock is cheap or expensive relative to peers
- User mentions "comps", "comparable companies", "relative valuation", or "multiples"
- User asks "how does X compare to Y?" in a financial context

## Methodology

### Step 1: Select Comparable Companies

Identify 5-10 comparable companies based on:

- **Industry**: Same GICS sub-industry or SIC code
- **Size**: Similar market cap (within 0.5x-2x)
- **Growth profile**: Similar revenue growth rates
- **Business model**: Similar revenue mix, customer type, geography
- **Profitability**: Similar margin profile

Exclude companies with:
- Pending M&A (trading at deal price)
- Recent IPO (< 6 months, limited data)
- Financial distress (unless the subject company is also distressed)
- Conglomerate discount (unless adjusting for it)

Use `get_quote` and `get_financials` to gather data on identified peers.

### Step 2: Gather Trading Multiples

For each comparable company, calculate:

**Enterprise Value Multiples:**
- EV/Revenue (LTM and NTM)
- EV/EBITDA (LTM and NTM)
- EV/EBIT (LTM and NTM)

**Equity Multiples:**
- P/E (LTM and NTM)
- P/B (Price-to-Book)
- PEG Ratio (P/E ÷ EPS growth rate)

**Sector-Specific:**
- EV/Subscribers (media, telecom)
- EV/ARR (SaaS)
- Price/FFO (REITs)
- P/TBV (banks)

### Step 3: Normalize the Data

Adjust for comparability:

- **Non-recurring items**: Strip one-time charges/gains from EBITDA and earnings
- **Stock-based compensation**: Decide whether to include in EBITDA (SBC-adjusted)
- **Operating leases**: Ensure consistent treatment across peers
- **Fiscal year alignment**: Calendarize if fiscal years differ
- **Currency**: Convert to common currency

### Step 4: Statistical Analysis

For each multiple, calculate:

| Statistic | Purpose |
|-----------|---------|
| Mean | Central tendency (affected by outliers) |
| Median | Central tendency (robust to outliers) |
| 25th percentile | Low end of range |
| 75th percentile | High end of range |
| Min / Max | Full range |

Remove outliers (> 2 standard deviations) before calculating statistics. Document which companies were excluded and why.

### Step 5: Apply Multiples to Target

1. Select the most relevant 2-3 multiples for the industry
2. Apply the peer median (or mean) multiple to the target's metrics
3. Calculate implied enterprise value and equity value for each multiple
4. Derive implied share price range

**Premium/Discount Assessment:**
- If the target trades above peer median: Why? (Faster growth? Better margins? Market leader?)
- If below: Why? (Execution risk? Slower growth? Market concern?)

### Step 6: Football Field Chart

Present a summary showing:
- Current stock price (vertical line)
- Implied range from each multiple (horizontal bars)
- 52-week high/low for context
- DCF range if available (from dcf-valuation skill)

## Output Format

1. Peer Selection Rationale (table with company, market cap, revenue, growth)
2. Trading Multiples Comparison (full table)
3. Statistical Summary (mean, median, percentiles)
4. Implied Valuation Range (for each multiple applied)
5. Premium/Discount Analysis
6. Key Takeaways and Caveats

## Important Notes

- Comps tell you what the market is paying, not what a company is worth intrinsically
- Use forward (NTM) multiples when possible — they reflect expected performance
- Always explain why certain peers were included or excluded
- Consider the market cycle — multiples compress in downturns and expand in bull markets
- Combine with DCF for a more complete valuation picture
