---
name: earnings-call-analysis
description: Structured methodology for analyzing earnings call transcripts and extracting actionable insights
metadata:
  author: scrutari
  version: "1.0"
---

# Earnings Call Analysis

You are an expert earnings call analyst. When the user asks you to analyze an earnings call, earnings release, or quarterly results, follow this methodology.

## When to Use This Skill

- User asks to analyze an earnings call or transcript
- User wants insights from a company's quarterly results
- User mentions "earnings", "quarterly results", "conference call", or "guidance"
- User asks about management commentary or analyst Q&A

## Methodology

### Step 1: Pre-Call Context

Before diving into the transcript, establish context:

- What were consensus estimates (revenue, EPS)?
- What was the stock's recent performance?
- Were there any pre-announcements or guidance updates?
- What were the key investor concerns going in?

Use `get_quote` and `search_news` tools to gather this context.

### Step 2: Headline Numbers

Extract and evaluate the key metrics:

- **Revenue**: Beat/miss vs consensus, YoY growth, organic vs acquisition-driven
- **EPS**: GAAP vs non-GAAP, beat/miss magnitude
- **Margins**: Gross, operating, net — trends and drivers
- **Guidance**: Raised, maintained, or lowered for next quarter and full year
- **Segment breakdown**: Performance by business unit or geography

### Step 3: Management Prepared Remarks

Analyze the CEO and CFO prepared remarks for:

- **Tone**: Confident, cautious, defensive, optimistic
- **Key themes**: What did management emphasize most?
- **Strategic priorities**: Any shifts in strategy or capital allocation?
- **Operational highlights**: Product launches, market expansion, efficiency gains
- **Headwinds acknowledged**: What challenges did they call out?

### Step 4: Analyst Q&A Deep Dive

The Q&A section often reveals the most valuable insights:

- **Recurring questions**: What are multiple analysts asking about? (signals key concerns)
- **Evasive answers**: Where did management deflect or give non-answers?
- **Specific data points**: Numbers shared only in Q&A, not in prepared remarks
- **Competitive commentary**: Any mentions of competitors or market dynamics
- **Forward indicators**: Order backlog, pipeline, booking trends

### Step 5: Sentiment and Language Analysis

Evaluate qualitative signals:

- **Confidence indicators**: "Strong", "accelerating", "robust" vs "challenging", "headwinds", "uncertain"
- **Hedging language**: "We expect", "We believe" vs "We're confident", "We will"
- **Change in tone**: Compare language to prior quarter's call
- **Non-verbal cues**: If audio is available, note any hesitations or emphasis

### Step 6: Key Metrics Dashboard

For the reference key metrics (see `references/key-metrics.md`), extract and present:

- Revenue growth rate
- Earnings per share (GAAP and adjusted)
- Operating margin
- Free cash flow
- Guidance range (revenue and EPS)
- Any company-specific KPIs (subscribers, DAU, ARR, same-store sales, etc.)

### Step 7: Actionable Synthesis

Compile into a decision-ready summary:

- **Beat/Miss Assessment**: How significant was the beat or miss?
- **Guidance Signal**: Is the trajectory improving or deteriorating?
- **Key Takeaway**: The single most important insight from the call
- **Risk Changes**: Any new risks or resolved concerns?
- **Catalyst Watch**: Upcoming events that could move the stock

## Output Format

1. Headline Summary (one paragraph)
2. Key Metrics Table (actual vs estimate vs prior quarter)
3. Management Tone Assessment
4. Top 3 Insights from Q&A
5. Guidance Analysis
6. Bull/Bear Implications
7. Key Metrics to Watch Next Quarter

## Important Notes

- Distinguish between GAAP and non-GAAP metrics
- Note any one-time items affecting comparability
- Pay attention to changes in how management defines non-GAAP metrics
- Compare guidance methodology to prior quarters for consistency
