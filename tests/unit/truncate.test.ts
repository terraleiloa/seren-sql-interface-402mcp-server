// ABOUTME: Unit tests for response truncation utility
// ABOUTME: Tests size-based truncation of API and database responses

import { truncateResponse, TruncateResult } from '../../src/utils/truncate.js';

describe('truncateResponse', () => {
  const DEFAULT_LIMIT = 32000;

  describe('when response is under limit', () => {
    it('returns data unchanged with truncated=false', () => {
      const data = { foo: 'bar', count: 123 };
      const result = truncateResponse(data, DEFAULT_LIMIT);

      expect(result.data).toEqual(data);
      expect(result.truncated).toBe(false);
      expect(result.originalSizeBytes).toBeUndefined();
    });

    it('handles null data', () => {
      const result = truncateResponse(null, DEFAULT_LIMIT);

      expect(result.data).toBeNull();
      expect(result.truncated).toBe(false);
    });

    it('handles empty array', () => {
      const result = truncateResponse([], DEFAULT_LIMIT);

      expect(result.data).toEqual([]);
      expect(result.truncated).toBe(false);
    });

    it('handles empty object', () => {
      const result = truncateResponse({}, DEFAULT_LIMIT);

      expect(result.data).toEqual({});
      expect(result.truncated).toBe(false);
    });
  });

  describe('when array response exceeds limit', () => {
    it('truncates array to fit within limit', () => {
      // Create array where each item is ~100 bytes
      const items = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `Item number ${i} with some padding text`,
        value: Math.random(),
      }));
      const limit = 1000; // Small limit to force truncation

      const result = truncateResponse(items, limit);

      expect(result.truncated).toBe(true);
      expect(result.originalSizeBytes).toBeGreaterThan(limit);
      expect(Array.isArray(result.data)).toBe(true);
      expect((result.data as unknown[]).length).toBeLessThan(items.length);

      // Verify truncated response fits within limit
      const truncatedSize = JSON.stringify(result.data).length;
      expect(truncatedSize).toBeLessThanOrEqual(limit);
    });

    it('keeps at least one item if possible', () => {
      const items = [{ id: 1, data: 'small' }];
      const limit = 1000;

      const result = truncateResponse(items, limit);

      expect(result.truncated).toBe(false);
      expect((result.data as unknown[]).length).toBe(1);
    });

    it('returns empty array if single item exceeds limit', () => {
      const items = [{ id: 1, data: 'x'.repeat(2000) }];
      const limit = 100;

      const result = truncateResponse(items, limit);

      expect(result.truncated).toBe(true);
      expect(result.data).toEqual([]);
      expect(result.originalSizeBytes).toBeGreaterThan(limit);
    });
  });

  describe('when object response exceeds limit', () => {
    it('truncates object with results array', () => {
      const data = {
        meta: { page: 1, total: 100 },
        results: Array.from({ length: 50 }, (_, i) => ({
          id: i,
          content: `Result ${i} with padding text here`,
        })),
      };
      const limit = 500;

      const result = truncateResponse(data, limit);

      expect(result.truncated).toBe(true);
      expect(result.originalSizeBytes).toBeGreaterThan(limit);

      // Should preserve structure with truncated results array
      const truncatedData = result.data as { meta: unknown; results: unknown[] };
      expect(truncatedData.meta).toEqual(data.meta);
      expect(truncatedData.results.length).toBeLessThan(data.results.length);
    });

    it('truncates object with data array', () => {
      const data = {
        status: 'ok',
        data: Array.from({ length: 50 }, (_, i) => ({ id: i, value: 'test' })),
      };
      const limit = 300;

      const result = truncateResponse(data, limit);

      expect(result.truncated).toBe(true);
      const truncatedData = result.data as { status: string; data: unknown[] };
      expect(truncatedData.status).toBe('ok');
      expect(truncatedData.data.length).toBeLessThan(data.data.length);
    });

    it('truncates object with items array', () => {
      const data = {
        items: Array.from({ length: 50 }, (_, i) => ({ id: i })),
      };
      const limit = 200;

      const result = truncateResponse(data, limit);

      expect(result.truncated).toBe(true);
      const truncatedData = result.data as { items: unknown[] };
      expect(truncatedData.items.length).toBeLessThan(data.items.length);
    });

    it('truncates object with rows array', () => {
      const data = {
        rows: Array.from({ length: 50 }, (_, i) => ({ id: i, col: 'value' })),
        rowCount: 50,
      };
      const limit = 300;

      const result = truncateResponse(data, limit);

      expect(result.truncated).toBe(true);
      const truncatedData = result.data as { rows: unknown[]; rowCount: number };
      expect(truncatedData.rows.length).toBeLessThan(data.rows.length);
    });

    it('returns truncation marker for non-array objects exceeding limit', () => {
      const data = {
        largeField: 'x'.repeat(5000),
        anotherField: 'y'.repeat(5000),
      };
      const limit = 500;

      const result = truncateResponse(data, limit);

      expect(result.truncated).toBe(true);
      expect(result.originalSizeBytes).toBeGreaterThan(limit);
      // Should return a marker indicating truncation
      expect(result.data).toHaveProperty('_truncated', true);
      expect(result.data).toHaveProperty('_message');
    });
  });

  describe('when string response exceeds limit', () => {
    it('truncates string with marker', () => {
      const data = 'x'.repeat(5000);
      const limit = 500;

      const result = truncateResponse(data, limit);

      expect(result.truncated).toBe(true);
      expect(result.originalSizeBytes).toBe(5002); // quotes around string
      expect(typeof result.data).toBe('string');
      expect((result.data as string).length).toBeLessThanOrEqual(limit);
      expect((result.data as string)).toContain('[TRUNCATED]');
    });
  });

  describe('edge cases', () => {
    it('handles deeply nested structures', () => {
      const data = {
        level1: {
          level2: {
            level3: {
              results: Array.from({ length: 100 }, (_, i) => ({ id: i })),
            },
          },
        },
      };
      const limit = 500;

      const result = truncateResponse(data, limit);

      expect(result.truncated).toBe(true);
      // Should still produce valid JSON
      expect(() => JSON.stringify(result.data)).not.toThrow();
    });

    it('uses default limit when not specified', () => {
      const smallData = { test: 'small' };
      const result = truncateResponse(smallData);

      expect(result.truncated).toBe(false);
    });
  });
});
