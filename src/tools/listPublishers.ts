// ABOUTME: MCP tool to list available x402-protected data publishers
// ABOUTME: Returns compact summaries to reduce context usage

import type { GatewayClient } from '../gateway/client.js';
import type { Publisher, PublisherSummary } from '../gateway/types.js';

export interface ListPublishersInput {
  category?: string;
  type?: 'database' | 'api' | 'both';
}

export interface ListPublishersOutput {
  success: boolean;
  publishers?: PublisherSummary[];
  error?: string;
}

/**
 * Convert a full Publisher to a compact PublisherSummary
 */
export function toPublisherSummary(publisher: Publisher): PublisherSummary {
  return {
    id: publisher.id,
    name: publisher.name,
    type: publisher.publisherType,
    categories: publisher.categories,
    description: publisher.resourceDescription,
  };
}

/**
 * List available x402-protected data publishers from the gateway catalog
 */
export async function listPublishers(
  input: ListPublishersInput,
  gateway: GatewayClient
): Promise<ListPublishersOutput> {
  try {
    const filters: { category?: string; type?: 'database' | 'api' | 'both' } = {};

    if (input.category) {
      filters.category = input.category;
    }
    if (input.type) {
      filters.type = input.type;
    }

    const publishers = await gateway.listPublishers(filters);
    const summaries = publishers.map(toPublisherSummary);

    return {
      success: true,
      publishers: summaries,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
