// ABOUTME: MCP tool to get detailed pricing configuration for a specific provider
// ABOUTME: Wraps GatewayClient.getProviderPricing() to retrieve basePricePer1000Rows and markupMultiplier

import type { GatewayClient } from '../gateway/client.js';
import type { ProviderPricingConfig } from '../gateway/types.js';

export interface GetProviderPricingDetailsInput {
  provider_id: string;
}

export interface GetProviderPricingDetailsOutput {
  success: boolean;
  pricing?: ProviderPricingConfig;
  error?: string;
}

/**
 * Get detailed pricing configuration for a specific x402-protected API provider.
 */
export async function getProviderPricingDetails(
  input: GetProviderPricingDetailsInput,
  gateway: GatewayClient
): Promise<GetProviderPricingDetailsOutput> {
  if (!input.provider_id) {
    return {
      success: false,
      error: 'Provider ID is required',
    };
  }

  try {
    const pricing = await gateway.getProviderPricing(input.provider_id);
    return {
      success: true,
      pricing,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
