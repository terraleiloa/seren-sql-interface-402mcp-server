// ABOUTME: MCP tool to get details for a specific x402-protected API provider
// ABOUTME: Wraps GatewayClient.getProvider() with input validation

import type { GatewayClient } from '../gateway/client.js';
import type { Provider } from '../gateway/types.js';

export interface GetProviderDetailsInput {
  provider_id: string;
}

export interface GetProviderDetailsOutput {
  success: boolean;
  provider?: Provider;
  error?: string;
}

/**
 * Get details for a specific x402-protected API provider
 */
export async function getProviderDetails(
  input: GetProviderDetailsInput,
  gateway: GatewayClient
): Promise<GetProviderDetailsOutput> {
  // Validate input
  if (!input.provider_id || input.provider_id.trim() === '') {
    return {
      success: false,
      error: 'provider_id is required',
    };
  }

  try {
    const provider = await gateway.getProvider(input.provider_id);

    return {
      success: true,
      provider,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
