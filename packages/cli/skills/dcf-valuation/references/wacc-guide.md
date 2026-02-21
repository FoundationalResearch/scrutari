# WACC Calculation Guide

## Formula

```
WACC = (E/V) × Re + (D/V) × Rd × (1 - T)
```

## Cost of Equity (Re) — CAPM

```
Re = Rf + β × ERP + Size Premium (optional)
```

| Component | Source | Typical Range |
|-----------|--------|---------------|
| Risk-free Rate (Rf) | 10-year US Treasury yield | 3.5-5.0% |
| Equity Risk Premium (ERP) | Damodaran, Duff & Phelps | 4.5-6.0% |
| Beta (β) | Regression vs S&P 500, 2-5 year weekly | 0.5-2.0 |
| Size Premium | Duff & Phelps for small-caps | 0-3% |

### Beta Estimation

- **Raw beta**: Regression of stock returns vs market returns
- **Adjusted beta**: (2/3 × Raw) + (1/3 × 1.0) — Bloomberg adjustment
- **Unlevered beta**: β_u = β_l / [1 + (1-T) × (D/E)]
- **Re-levered beta**: β_l = β_u × [1 + (1-T) × (D/E)]

Use unlevered peer betas when:
- Company is private or recently IPO'd
- Capital structure is changing significantly
- Beta estimate is unreliable (low R², short history)

## Cost of Debt (Rd)

Best sources (in order of preference):
1. Yield-to-maturity on existing bonds
2. Credit spread based on rating + risk-free rate
3. Interest expense / average total debt (blended rate)

| Credit Rating | Typical Spread Over Treasuries |
|--------------|-------------------------------|
| AAA | 0.5-1.0% |
| AA | 1.0-1.5% |
| A | 1.5-2.0% |
| BBB | 2.0-3.0% |
| BB | 3.0-4.5% |
| B | 4.5-6.5% |
| CCC or lower | 7.0%+ |

## Capital Structure Weights

- Use **market values**, not book values
- E = Market capitalization (share price × diluted shares)
- D = Market value of debt (or book value if no public bonds)
- V = E + D

For target WACC (forward-looking), consider:
- Company's stated target capital structure
- Industry-average leverage ratios
- Optimal capital structure analysis

## Common Pitfalls

1. **Using book value weights** — Always use market values
2. **Inconsistent currency** — Match risk-free rate currency to cash flow currency
3. **Wrong beta lookback** — 2-year weekly is standard; 5-year monthly is alternative
4. **Ignoring operating leases** — Capitalize and include in debt under IFRS 16 / ASC 842
5. **Static WACC** — If capital structure changes significantly, use adjusted WACC per period
6. **Country risk** — For emerging market companies, add a country risk premium to Re
7. **Negative net debt** — If cash > debt, WACC approaches cost of equity

## Quick Reference WACC Ranges

| Company Profile | Typical WACC |
|----------------|-------------|
| Mega-cap utility | 5-7% |
| Large-cap consumer staple | 7-9% |
| Large-cap technology | 8-11% |
| Mid-cap industrial | 9-12% |
| Small-cap growth | 12-16% |
| Biotech (pre-revenue) | 15-20%+ |
