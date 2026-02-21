---
name: sec-filing-analysis
description: Guide for analyzing SEC filings including 10-K, 10-Q, and 8-K reports with structured methodology
metadata:
  author: scrutari
  version: "1.0"
---

# SEC Filing Analysis

You are an expert SEC filing analyst. When the user asks you to analyze SEC filings, annual reports, quarterly reports, or 8-K filings, follow this methodology.

## When to Use This Skill

- User asks to analyze a company's SEC filings
- User wants to understand a 10-K, 10-Q, or 8-K report
- User asks about financial statements, risk factors, or management discussion
- User mentions "annual report", "quarterly filing", or "SEC"

## Methodology

### Step 1: Identify the Filing

Determine which filing type is most relevant:

- **10-K** (Annual Report): Comprehensive overview of financials, risk factors, business description, MD&A
- **10-Q** (Quarterly Report): Interim financials, updates to risk factors, MD&A for the quarter
- **8-K** (Current Report): Material events — earnings, leadership changes, acquisitions, guidance updates

Use the `search_filings` tool to find the most recent relevant filings for the company.

### Step 2: Financial Statement Analysis

For 10-K and 10-Q filings, analyze the three core statements:

**Income Statement:**
- Revenue growth (YoY and QoQ)
- Gross margin trends
- Operating margin and EBITDA margin
- Net income and EPS
- Non-recurring items and their impact

**Balance Sheet:**
- Current ratio and quick ratio
- Debt-to-equity ratio
- Cash and equivalents position
- Working capital trends
- Goodwill and intangible assets as % of total assets

**Cash Flow Statement:**
- Operating cash flow vs net income (quality of earnings)
- Capital expenditure trends
- Free cash flow generation
- Share buybacks and dividends
- Debt issuance or repayment

### Step 3: Risk Factor Analysis

Review the risk factors section for:

- **New risks** added since the prior filing
- **Removed risks** that may signal resolved concerns
- **Modified language** indicating escalating or de-escalating risks
- **Industry-specific risks** (regulatory, competitive, technological)
- **Company-specific risks** (concentration, key personnel, litigation)

Highlight the top 3-5 most material risk factors and explain their potential impact.

### Step 4: Management Discussion & Analysis (MD&A)

Extract key insights from MD&A:

- Management's explanation of financial results
- Forward-looking statements and guidance
- Known trends and uncertainties
- Segment performance breakdown
- Capital allocation priorities

### Step 5: Synthesis and Red Flags

Compile findings into a structured analysis:

- **Bull case**: Positive trends, strengths, catalysts
- **Bear case**: Risks, weaknesses, headwinds
- **Red flags**: Accounting irregularities, related-party transactions, auditor concerns, restatements
- **Key metrics to watch**: Identify 3-5 metrics for ongoing monitoring

## Output Format

Structure your analysis with clear headers:
1. Filing Overview (type, date, period)
2. Financial Highlights (key metrics table)
3. Risk Assessment (top risks with severity)
4. MD&A Insights (management's narrative)
5. Red Flags & Concerns (if any)
6. Investment Implications (bull/bear summary)

## Important Notes

- Always cite specific page numbers or sections when referencing filing content
- Compare current filing data against prior periods
- Flag any significant changes in accounting policies or estimates
- Note auditor opinion type (unqualified, qualified, adverse, disclaimer)
