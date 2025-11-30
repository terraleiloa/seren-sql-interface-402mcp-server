// ABOUTME: Type definitions for x402 gateway API
// ABOUTME: Matches gateway/src/types/x402.ts

export interface PaymentRequirement {
  scheme: string;
  network: string;
  maxAmountRequired: string;  // Atomic units (6 decimals for USDC)
  asset: string;              // USDC contract address
  payTo: string;              // Gateway wallet address
  resource: string;
  description: string;
  mimeType: string;
  outputSchema: Record<string, unknown> | null;
  maxTimeoutSeconds: number;
  extra?: {
    paymentRequestId?: string;
    estimatedCost?: string;    // Human-readable decimal
    eip712?: {
      name: string;
      version: string;
      chainId: number;
      verifyingContract: string;
    };
    [key: string]: unknown;
  };
}

export interface PaymentRequirementsResponse {
  x402Version: number;
  error?: string;
  accepts: PaymentRequirement[];
}

export interface PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    signature: string;
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
  };
}

export interface Provider {
  id: string;
  name: string;
  resourceName?: string;
  resourceDescription?: string;
  providerType: 'database' | 'api' | 'both';
  pricePerCall?: string;
  categories?: string[];
  upstreamApiUrl?: string;
}

export interface ProxyRequest {
  providerId: string;
  agentWallet: string;
  request: {
    method: string;
    path: string;
    body?: unknown;
    headers?: Record<string, string>;
  };
}

export interface ProviderPricingConfig {
  id: string;
  providerId: string;
  basePricePer1000Rows: number;
  markupMultiplier: number;
  createdAt: string;
  updatedAt: string;
}
