// ABOUTME: MCP tool to list available x402-protected API providers
// ABOUTME: Wraps GatewayClient.listProviders() with optional filtering

import type { GatewayClient } from '../gateway/client.js';
import type { Provider } from '../gateway/types.js';

export interface ListProvidersInput {
  category?: string;
  type?: 'database' | 'api' | 'both';
}

export interface ListProvidersOutput {
  success: boolean;
  providers?: Provider[];
  error?: string;
}

/**
 * List available x402-protected API providers from the gateway catalog
 */
export async function listProviders(
  input: ListProvidersInput,
  gateway: GatewayClient
): Promise<ListProvidersOutput> {
  try {
    const filters: { category?: string; type?: 'database' | 'api' | 'both' } = {};

    if (input.category) {
      filters.category = input.category;
    }
    if (input.type) {
      filters.type = input.type;
    }

    const providers = await gateway.listProviders(filters);

    return {
      success: true,
      providers,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
