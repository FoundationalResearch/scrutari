import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchFilingsTool, getFilingTool, getFinancialsTool } from './tools.js';
import type { ToolContext } from '../types.js';

const mockContext: ToolContext = {
  config: { userAgent: 'test-agent/1.0 (test@example.com)' },
};

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe('searchFilingsTool', () => {
  it('returns filings on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        hits: {
          total: { value: 2 },
          hits: [
            {
              _id: '0000320193-23-000077',
              _source: {
                form_type: '10-K',
                file_date: '2023-11-03',
                display_names: ['Apple Inc'],
              },
            },
            {
              _id: '0000320193-23-000064',
              _source: {
                form_type: '10-Q',
                file_date: '2023-08-04',
                display_names: ['Apple Inc'],
              },
            },
          ],
        },
      }),
    });

    const result = await searchFilingsTool.execute({ ticker: 'AAPL' }, mockContext);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      filings: [
        {
          accessionNumber: '0000320193-23-000077',
          filingDate: '2023-11-03',
          form: '10-K',
          primaryDocument: '0000320193-23-000077',
          companyName: 'Apple Inc',
        },
        {
          accessionNumber: '0000320193-23-000064',
          filingDate: '2023-08-04',
          form: '10-Q',
          primaryDocument: '0000320193-23-000064',
          companyName: 'Apple Inc',
        },
      ],
      totalHits: 2,
    });
    expect(result.source?.url).toContain('AAPL');
  });

  it('passes filing_type and date_range to API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ hits: { total: { value: 0 }, hits: [] } }),
    });

    await searchFilingsTool.execute(
      { ticker: 'MSFT', filing_type: '10-K', date_range: 'custom' },
      mockContext,
    );

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('forms=10-K');
    expect(calledUrl).toContain('dateRange=custom');
  });

  it('returns error on non-retryable API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      headers: new Headers(),
    });

    const result = await searchFilingsTool.execute({ ticker: 'AAPL' }, mockContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain('403');
  });

  it('rejects invalid params', async () => {
    await expect(searchFilingsTool.execute({}, mockContext)).rejects.toThrow();
  });
});

describe('getFilingTool', () => {
  it('returns filing content', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body>Filing content here</body></html>',
    });

    const result = await getFilingTool.execute(
      { accession_number: '0000320193-23-000077' },
      mockContext,
    );
    expect(result.success).toBe(true);
    expect((result.data as { content: string }).content).toContain('Filing content here');
    expect((result.data as { accessionNumber: string }).accessionNumber).toBe('0000320193-23-000077');
  });

  it('truncates very long filings', async () => {
    const longContent = 'x'.repeat(60000);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => longContent,
    });

    const result = await getFilingTool.execute(
      { accession_number: '0000320193-23-000077' },
      mockContext,
    );
    expect(result.success).toBe(true);
    const content = (result.data as { content: string }).content;
    expect(content.length).toBeLessThan(60000);
    expect(content).toContain('[... truncated ...]');
  });

  it('returns error on fetch failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers(),
    });

    const result = await getFilingTool.execute(
      { accession_number: 'invalid' },
      mockContext,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('404');
  });
});

describe('getFinancialsTool', () => {
  it('returns extracted financial metrics', async () => {
    // First call: CIK lookup
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        '0': { cik_str: 320193, ticker: 'AAPL' },
        '1': { cik_str: 789019, ticker: 'MSFT' },
      }),
    });
    // Second call: company facts
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        cik: 320193,
        entityName: 'Apple Inc',
        facts: {
          'us-gaap': {
            Revenue: {
              label: 'Revenue',
              description: 'Total revenue',
              units: {
                USD: [
                  { val: 394328000000, accn: 'acc1', fy: 2022, fp: 'FY', form: '10-K', filed: '2022-10-28', end: '2022-09-24' },
                  { val: 383285000000, accn: 'acc2', fy: 2023, fp: 'FY', form: '10-K', filed: '2023-11-03', end: '2023-09-30' },
                ],
              },
            },
            NetIncomeLoss: {
              label: 'Net Income',
              description: 'Net income',
              units: {
                USD: [
                  { val: 99803000000, accn: 'acc3', fy: 2022, fp: 'FY', form: '10-K', filed: '2022-10-28', end: '2022-09-24' },
                ],
              },
            },
          },
        },
      }),
    });

    const result = await getFinancialsTool.execute({ ticker: 'AAPL' }, mockContext);
    expect(result.success).toBe(true);

    const data = result.data as Record<string, unknown>;
    expect(data.entityName).toBe('Apple Inc');
    expect(data.cik).toBe(320193);
    expect(data.Revenue).toBeDefined();
    expect(data.NetIncomeLoss).toBeDefined();
    expect(result.source?.url).toContain('CIK0000320193');
  });

  it('filters by annual period', async () => {
    // CIK for AAPL is already cached from the previous test,
    // so only the company facts fetch is needed
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        cik: 320193,
        entityName: 'Apple Inc',
        facts: {
          'us-gaap': {
            Revenue: {
              label: 'Revenue',
              description: '',
              units: {
                USD: [
                  { val: 100, accn: 'a1', fy: 2023, fp: 'Q1', form: '10-Q', filed: '2023-02-01', end: '2023-01-01' },
                  { val: 400, accn: 'a2', fy: 2023, fp: 'FY', form: '10-K', filed: '2023-11-01', end: '2023-09-30' },
                ],
              },
            },
          },
        },
      }),
    });

    const result = await getFinancialsTool.execute(
      { ticker: 'AAPL', period: 'annual' },
      mockContext,
    );
    expect(result.success).toBe(true);
    const data = result.data as { Revenue: Array<{ period: string }> };
    // Only FY entries
    expect(data.Revenue).toHaveLength(1);
    expect(data.Revenue[0].period).toBe('FY');
  });

  it('returns error when ticker not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        '0': { cik_str: 320193, ticker: 'AAPL' },
      }),
    });

    const result = await getFinancialsTool.execute({ ticker: 'ZZZZZ' }, mockContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain('CIK not found');
  });
});
