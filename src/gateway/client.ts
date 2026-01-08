// ABOUTME: HTTP client for x402 gateway communication
// ABOUTME: Handles 402 responses and payment header encoding

import { config } from '../config/index.js';
import type {
  PaymentRequirementsResponse,
  PaymentPayload,
  Publisher,
  PublisherPricingConfig,
  ProxyRequest,
  QueryRequest,
  QueryResult,
  CreditBalance,
} from './types.js';

export class GatewayClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? config.X402_GATEWAY_URL;
  }

  /**
   * List available publishers from the catalog
   */
  async listPublishers(options?: {
    category?: string;
    type?: 'database' | 'api' | 'both';
  }): Promise<Publisher[]> {
    const params = new URLSearchParams();
    if (options?.category) params.set('category', options.category);
    if (options?.type) params.set('type', options.type);

    const url = `${this.baseUrl}/api/catalog${params.toString() ? '?' + params : ''}`;
    const response = await fetch(url);

    if (!response.ok) {
      // Consume error response body to ensure connection is closed
      await response.text().catch(() => '');
      throw new Error(`Failed to list publishers: ${response.status}`);
    }

    // Manually parse to ensure robustness against subtle fetch/environment issues
    const responseText = await response.text();
    try {
      const data = JSON.parse(responseText);

      // Handle direct array response
      if (Array.isArray(data)) {
        return data as Publisher[];
      }

      // Handle object-wrapped array response (e.g., { "publishers": [...] })
      if (data && Array.isArray(data.publishers)) {
        return data.publishers;
      }

      // If the response is not in a known format, return an empty array
      return [];
    } catch (e) {
      // Handle cases where the response text is not valid JSON
      throw new Error('Failed to parse JSON response from gateway');
    }
  }

  /**
   * Get details for a specific publisher
   */
  async getPublisher(publisherId: string): Promise<Publisher> {
    const response = await fetch(`${this.baseUrl}/api/catalog/${publisherId}`);

    if (!response.ok) {
      // Consume error response body to ensure connection is closed
      await response.text().catch(() => '');
      throw new Error(`Publisher not found: ${publisherId}`);
    }

    return response.json() as Promise<Publisher>;
  }

  /**
   * Get detailed pricing configuration for a specific publisher
   */
  async getPublisherPricing(publisherId: string): Promise<PublisherPricingConfig> {
    const response = await fetch(`${this.baseUrl}/api/publishers/${publisherId}/pricing`);

    if (!response.ok) {
      // Consume error response body to ensure connection is closed
      await response.text().catch(() => '');
      if (response.status === 404) {
        throw new Error(`Pricing configuration not found for publisher: ${publisherId}`);
      }
      throw new Error(`Failed to get pricing for publisher ${publisherId}: ${response.status}`);
    }

    return response.json() as Promise<PublisherPricingConfig>;
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

    const url = `${this.baseUrl}/api/proxy`;
    const body = JSON.stringify(request);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (response.status === 402) {
      const paymentRequired = await response.json() as PaymentRequirementsResponse;
      return { status: 402, paymentRequired };
    }

    if (!response.ok) {
      const errorText = await response.text();
      let errorBody: { error?: string };
      try {
        errorBody = JSON.parse(errorText);
      } catch {
        errorBody = { error: errorText || 'Unknown error' };
      }
      const errorMessage = typeof errorBody.error === 'string'
        ? errorBody.error
        : JSON.stringify(errorBody.error) ?? response.status;
      throw new Error(`Proxy request failed: ${errorMessage}`);
    }

    const data = await response.json();
    const paymentResponse = response.headers.get('X-PAYMENT-RESPONSE') ?? undefined;

    return { status: 200, data, paymentResponse };
  }

  /**
   * Execute a database query (may return 402)
   */
  async queryDatabase(
    request: QueryRequest,
    paymentPayload?: PaymentPayload,
    timeoutMs?: number
  ): Promise<{
    status: number;
    data?: QueryResult;
    paymentRequired?: PaymentRequirementsResponse;
    paymentResponse?: string;
  }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (paymentPayload) {
      headers['X-PAYMENT'] = this.encodePaymentPayload(paymentPayload);
    }

    const url = `${this.baseUrl}/api/query`;
    const body = JSON.stringify(request);
    
    // Set up timeout using AbortController
    const timeout = timeoutMs ?? config.QUERY_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

    if (response.status === 402) {
      const paymentRequired = await response.json() as PaymentRequirementsResponse;
      return { status: 402, paymentRequired };
    }

      if (!response.ok) {
        const errorText = await response.text();
        let errorBody: Record<string, unknown>;
        try {
          errorBody = JSON.parse(errorText);
        } catch {
          errorBody = { error: errorText || 'Unknown error', rawResponse: errorText };
        }
        
        // Build detailed error message
        const errorParts: string[] = [
          `Query request failed (HTTP ${response.status} ${response.statusText})`
        ];
        
        // Include error message if available
        if (errorBody.error) {
          errorParts.push(`Error: ${errorBody.error}`);
        }
        
        // Include full error body for debugging (if it's an object with more fields)
        const errorBodyStr = JSON.stringify(errorBody, null, 2);
        if (errorBodyStr && errorBodyStr !== JSON.stringify({ error: errorBody.error })) {
          errorParts.push(`Full error response: ${errorBodyStr}`);
        }
        
        // Create error with full details
        const error = new Error(errorParts.join('\n'));
        // Attach additional context as properties for programmatic access
        (error as any).statusCode = response.status;
        (error as any).statusText = response.statusText;
        (error as any).errorBody = errorBody;
        (error as any).requestDetails = {
          url,
          publisherId: request.publisherId,
          sql: request.sql,
          hasPayment: !!paymentPayload
        };
        throw error;
      }

      const data = await response.json() as QueryResult;
      const paymentResponse = response.headers.get('X-PAYMENT-RESPONSE') ?? undefined;

      return { status: 200, data, paymentResponse };
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Handle timeout/abort errors
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new Error(`Query request timed out after ${timeout}ms`);
        (timeoutError as any).statusCode = 408; // Request Timeout
        (timeoutError as any).statusText = 'Request Timeout';
        (timeoutError as any).errorBody = { 
          error: 'Request timeout', 
          details: `Query exceeded timeout of ${timeout}ms`,
          timeoutMs: timeout 
        };
        (timeoutError as any).requestDetails = {
          url,
          publisherId: request.publisherId,
          sql: request.sql,
          hasPayment: !!paymentPayload
        };
        throw timeoutError;
      }
      
      // Note: fetch API automatically closes connections when response body is consumed
      // or when the request is aborted, so no manual cleanup needed here
      
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Get credit balance for an agent wallet
   */
  async getCreditBalance(agentWallet: string): Promise<CreditBalance> {
    const response = await fetch(`${this.baseUrl}/api/credits/${agentWallet}`);

    if (!response.ok) {
      // Consume error response body to ensure connection is closed
      const errorText = await response.text().catch(() => '');
      if (response.status === 404) {
        throw new Error('Credit balance not found');
      }
      throw new Error(`Failed to get credit balance: ${response.status}`);
    }

    return response.json() as Promise<CreditBalance>;
  }

  /**
   * Confirm a USDC deposit to credit balance (legacy flow)
   */
  async confirmDeposit(
    agentWallet: string,
    txHash: string,
    amount: string
  ): Promise<CreditBalance> {
    const response = await fetch(`${this.baseUrl}/api/credits/confirm-deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentWallet, txHash, amount }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorBody: { error?: string };
      try {
        errorBody = JSON.parse(errorText);
      } catch {
        errorBody = { error: errorText || 'Unknown error' };
      }
      if (errorBody.error) {
        throw new Error(errorBody.error);
      }
      throw new Error(`Failed to confirm deposit: ${response.status}`);
    }

    return response.json() as Promise<CreditBalance>;
  }

  /**
   * Update publisher connection string
   */
  async updatePublisherConnection(
    connectionString: string,
    apiKey: string
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const url = `${this.baseUrl}/api/publishers/update`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    const response = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ connectionString }),
    });

    if (!response.ok) {
      // Consume error response body to ensure connection is closed
      const errorText = await response.text();
      let errorBody: { error?: string; message?: string };
      try {
        errorBody = JSON.parse(errorText);
      } catch {
        errorBody = { error: errorText || 'Unknown error' };
      }

      const errorMessage = errorBody.error || errorBody.message || `Failed to update publisher connection: ${response.status}`;
      
      if (response.status === 401 || response.status === 403) {
        throw new Error(`Authentication failed: ${errorMessage}`);
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json() as { message?: string };
    return {
      success: true,
      message: data.message || 'Connection string updated successfully',
    };
  }

  /**
   * Deposit credits via x402 payment flow (returns 402 with requirements, or success)
   */
  async depositCredits(
    amount: string,
    paymentPayload?: PaymentPayload
  ): Promise<{
    status: number;
    data?: {
      message: string;
      deposited: string;
      balance: CreditBalance;
      transaction: string;
    };
    paymentRequired?: PaymentRequirementsResponse;
  }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (paymentPayload) {
      headers['X-PAYMENT'] = this.encodePaymentPayload(paymentPayload);
    }

    const response = await fetch(`${this.baseUrl}/api/credits/deposit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ amount }),
    });

    if (response.status === 402) {
      const paymentRequired = await response.json() as PaymentRequirementsResponse;
      return { status: 402, paymentRequired };
    }

    if (!response.ok) {
      const errorText = await response.text();
      let errorBody: { error?: string };
      try {
        errorBody = JSON.parse(errorText);
      } catch {
        errorBody = { error: errorText || 'Unknown error' };
      }
      throw new Error(`Deposit failed: ${errorBody.error ?? response.status}`);
    }

    const data = await response.json() as {
      message: string;
      deposited: string;
      balance: CreditBalance;
      transaction: string;
    };
    return { status: 200, data };
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
