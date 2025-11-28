// ABOUTME: HTTP client for x402 gateway communication
// ABOUTME: Handles 402 responses and payment header encoding

import { config } from '../config/index.js';
import type {
  PaymentRequirementsResponse,
  PaymentPayload,
  Provider,
  ProxyRequest,
} from './types.js';

export class GatewayClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? config.X402_GATEWAY_URL;
  }

  /**
   * List available providers from the catalog
   */
  async listProviders(options?: {
    category?: string;
    type?: 'database' | 'api' | 'both';
  }): Promise<Provider[]> {
    const params = new URLSearchParams();
    if (options?.category) params.set('category', options.category);
    if (options?.type) params.set('type', options.type);

    const url = `${this.baseUrl}/api/catalog${params.toString() ? '?' + params : ''}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to list providers: ${response.status}`);
    }

    const data = await response.json() as { providers: Provider[] };
    return data.providers;
  }

  /**
   * Get details for a specific provider
   */
  async getProvider(providerId: string): Promise<Provider> {
    const response = await fetch(`${this.baseUrl}/api/catalog/${providerId}`);

    if (!response.ok) {
      throw new Error(`Provider not found: ${providerId}`);
    }

    return response.json() as Promise<Provider>;
  }

  /**
   * Make a proxy request (may return 402)
   */
  async proxyRequest(
    request: ProxyRequest,
    paymentPayload?: PaymentPayload
  ): Promise<{
    status: number;
    data?: unknown;
    paymentRequired?: PaymentRequirementsResponse;
    paymentResponse?: string;
  }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (paymentPayload) {
      headers['X-PAYMENT'] = this.encodePaymentPayload(paymentPayload);
    }

    const response = await fetch(`${this.baseUrl}/api/proxy`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    if (response.status === 402) {
      const paymentRequired = await response.json() as PaymentRequirementsResponse;
      return { status: 402, paymentRequired };
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
      throw new Error(`Proxy request failed: ${errorBody.error ?? response.status}`);
    }

    const data = await response.json();
    const paymentResponse = response.headers.get('X-PAYMENT-RESPONSE') ?? undefined;

    return { status: 200, data, paymentResponse };
  }

  /**
   * Encode payment payload to base64 for X-PAYMENT header
   */
  encodePaymentPayload(payload: PaymentPayload): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  /**
   * Decode X-PAYMENT-RESPONSE header
   */
  decodePaymentResponse(encoded: string): unknown {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  }
}

// Singleton instance
export const gatewayClient = new GatewayClient();
