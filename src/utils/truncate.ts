// ABOUTME: Utility for truncating large API/database responses to prevent context overflow
// ABOUTME: Preserves JSON structure while limiting response size in characters

export interface TruncateResult {
  data: unknown;
  truncated: boolean;
  originalSizeBytes?: number;
}

const DEFAULT_MAX_SIZE = 32000; // ~8000 tokens

// Common array field names in API responses
const ARRAY_FIELD_NAMES = ['results', 'data', 'items', 'rows', 'records', 'entries'];

/**
 * Truncates a response to fit within the specified character limit.
 * Preserves valid JSON structure.
 */
export function truncateResponse(
  data: unknown,
  maxSizeChars: number = DEFAULT_MAX_SIZE
): TruncateResult {
  // Handle null/undefined
  if (data === null || data === undefined) {
    return { data, truncated: false };
  }

  const serialized = JSON.stringify(data);
  const originalSize = serialized.length;

  // Under limit - return as-is
  if (originalSize <= maxSizeChars) {
    return { data, truncated: false };
  }

  // Handle arrays directly
  if (Array.isArray(data)) {
    return truncateArray(data, maxSizeChars, originalSize);
  }

  // Handle strings
  if (typeof data === 'string') {
    return truncateString(data, maxSizeChars, originalSize);
  }

  // Handle objects - look for common array fields to truncate
  if (typeof data === 'object') {
    return truncateObject(data as Record<string, unknown>, maxSizeChars, originalSize);
  }

  // Primitive that somehow exceeds limit - return truncation marker
  return {
    data: { _truncated: true, _message: `Response truncated (${originalSize} bytes)` },
    truncated: true,
    originalSizeBytes: originalSize,
  };
}

function truncateArray(
  arr: unknown[],
  maxSize: number,
  originalSize: number
): TruncateResult {
  if (arr.length === 0) {
    return { data: arr, truncated: false };
  }

  // Binary search to find max items that fit
  let low = 0;
  let high = arr.length;
  let bestFit = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const slice = arr.slice(0, mid);
    const size = JSON.stringify(slice).length;

    if (size <= maxSize) {
      bestFit = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const truncatedArr = arr.slice(0, bestFit);

  return {
    data: truncatedArr,
    truncated: true,
    originalSizeBytes: originalSize,
  };
}

function truncateString(
  str: string,
  maxSize: number,
  originalSize: number
): TruncateResult {
  // Account for quotes in JSON serialization
  const marker = ' [TRUNCATED]';
  const availableChars = maxSize - marker.length - 2; // -2 for quotes

  if (availableChars <= 0) {
    return {
      data: '[TRUNCATED]',
      truncated: true,
      originalSizeBytes: originalSize,
    };
  }

  return {
    data: str.slice(0, availableChars) + marker,
    truncated: true,
    originalSizeBytes: originalSize,
  };
}

function truncateObject(
  obj: Record<string, unknown>,
  maxSize: number,
  originalSize: number
): TruncateResult {
  // Look for common array fields to truncate
  for (const fieldName of ARRAY_FIELD_NAMES) {
    if (fieldName in obj && Array.isArray(obj[fieldName])) {
      const result = truncateObjectArrayField(obj, fieldName, maxSize, originalSize);
      if (result) {
        return result;
      }
    }
  }

  // No truncatable array field found - check for any array field
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value) && value.length > 0) {
      const result = truncateObjectArrayField(obj, key, maxSize, originalSize);
      if (result) {
        return result;
      }
    }
  }

  // No array fields - return truncation marker
  return {
    data: {
      _truncated: true,
      _message: `Response truncated (${originalSize} bytes). Object too large to fit within limit.`,
    },
    truncated: true,
    originalSizeBytes: originalSize,
  };
}

function truncateObjectArrayField(
  obj: Record<string, unknown>,
  fieldName: string,
  maxSize: number,
  originalSize: number
): TruncateResult | null {
  const arr = obj[fieldName] as unknown[];

  // Calculate overhead from other fields
  const withoutArray = { ...obj, [fieldName]: [] };
  const overhead = JSON.stringify(withoutArray).length;
  const availableForArray = maxSize - overhead + 2; // +2 for empty array "[]"

  if (availableForArray <= 2) {
    // Not enough space even for empty array
    return {
      data: { ...obj, [fieldName]: [] },
      truncated: true,
      originalSizeBytes: originalSize,
    };
  }

  // Binary search for best fit
  let low = 0;
  let high = arr.length;
  let bestFit = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const slice = arr.slice(0, mid);
    const size = JSON.stringify(slice).length;

    if (size <= availableForArray) {
      bestFit = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const truncatedObj = { ...obj, [fieldName]: arr.slice(0, bestFit) };
  const finalSize = JSON.stringify(truncatedObj).length;

  // Verify we're under limit
  if (finalSize > maxSize) {
    // Edge case - reduce by one more
    const saferObj = { ...obj, [fieldName]: arr.slice(0, Math.max(0, bestFit - 1)) };
    return {
      data: saferObj,
      truncated: true,
      originalSizeBytes: originalSize,
    };
  }

  return {
    data: truncatedObj,
    truncated: true,
    originalSizeBytes: originalSize,
  };
}
