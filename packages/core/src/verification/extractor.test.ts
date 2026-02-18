import { describe, it, expect } from 'vitest';
import { parseExtractionResponse } from './extractor.js';

describe('parseExtractionResponse', () => {
  it('parses a valid JSON array of claims', () => {
    const json = JSON.stringify([
      { text: 'Revenue was $50 billion', category: 'metric', value: 50, unit: 'billion' },
      { text: 'CEO resigned in March', category: 'event' },
      { text: 'Growth outpaced competitors', category: 'comparison' },
    ]);

    const claims = parseExtractionResponse(json);
    expect(claims).toHaveLength(3);
    expect(claims[0].id).toBe('claim-1');
    expect(claims[0].text).toBe('Revenue was $50 billion');
    expect(claims[0].category).toBe('metric');
    expect(claims[0].status).toBe('unverified');
    expect(claims[0].confidence).toBe(0);
    expect(claims[0].sources).toEqual([]);

    // Check metric fields
    expect((claims[0] as Record<string, unknown>).value).toBe(50);
    expect((claims[0] as Record<string, unknown>).unit).toBe('billion');

    expect(claims[1].category).toBe('event');
    expect(claims[2].category).toBe('comparison');
  });

  it('handles markdown code fences around JSON', () => {
    const json = '```json\n[\n  {"text": "Revenue grew 15%", "category": "metric", "value": 15, "unit": "%"}\n]\n```';
    const claims = parseExtractionResponse(json);
    expect(claims).toHaveLength(1);
    expect(claims[0].text).toBe('Revenue grew 15%');
  });

  it('handles code fences without language specifier', () => {
    const json = '```\n[{"text": "Test claim", "category": "general"}]\n```';
    const claims = parseExtractionResponse(json);
    expect(claims).toHaveLength(1);
  });

  it('extracts JSON array from surrounding text', () => {
    const content = 'Here are the claims:\n[{"text": "EPS was $2.50", "category": "metric", "value": 2.5, "unit": "USD"}]\nDone.';
    const claims = parseExtractionResponse(content);
    expect(claims).toHaveLength(1);
    expect(claims[0].text).toBe('EPS was $2.50');
  });

  it('returns empty array for invalid JSON', () => {
    const claims = parseExtractionResponse('this is not json');
    expect(claims).toEqual([]);
  });

  it('returns empty array for non-array JSON', () => {
    const claims = parseExtractionResponse('{"text": "not an array"}');
    expect(claims).toEqual([]);
  });

  it('skips entries without text field', () => {
    const json = JSON.stringify([
      { text: 'Valid claim', category: 'general' },
      { category: 'event' }, // missing text
      { text: '', category: 'general' }, // empty text
      { text: 'Another valid', category: 'metric', value: 100, unit: 'USD' },
    ]);
    const claims = parseExtractionResponse(json);
    expect(claims).toHaveLength(2);
    expect(claims[0].text).toBe('Valid claim');
    expect(claims[1].text).toBe('Another valid');
  });

  it('defaults to general category for unknown categories', () => {
    const json = JSON.stringify([
      { text: 'Some claim', category: 'invented-category' },
    ]);
    const claims = parseExtractionResponse(json);
    expect(claims[0].category).toBe('general');
  });

  it('defaults to general category for missing category', () => {
    const json = JSON.stringify([
      { text: 'Some claim' },
    ]);
    const claims = parseExtractionResponse(json);
    expect(claims[0].category).toBe('general');
  });

  it('assigns sequential claim IDs', () => {
    const json = JSON.stringify([
      { text: 'First', category: 'general' },
      { text: 'Second', category: 'event' },
      { text: 'Third', category: 'projection' },
    ]);
    const claims = parseExtractionResponse(json);
    expect(claims.map(c => c.id)).toEqual(['claim-1', 'claim-2', 'claim-3']);
  });

  it('skips null/non-object entries', () => {
    const json = '[{"text": "Valid", "category": "general"}, null, 42, "string"]';
    const claims = parseExtractionResponse(json);
    expect(claims).toHaveLength(1);
  });

  it('handles metric claims without value', () => {
    const json = JSON.stringify([
      { text: 'Revenue is high', category: 'metric' },
    ]);
    const claims = parseExtractionResponse(json);
    expect(claims).toHaveLength(1);
    expect(claims[0].category).toBe('metric');
    // No value/unit attached since value is not a number
    expect((claims[0] as Record<string, unknown>).value).toBeUndefined();
  });
});
