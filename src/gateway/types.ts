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

export interface Publisher {
  id: string;
  name: string;
  resourceName?: string;
  resourceDescription?: string;
  publisherType: 'database' | 'api' | 'both';
  pricePerCall?: string;
  categories?: string[];
  upstreamApiUrl?: string;
}

export interface ProxyRequest {
  publisherId: string;
  agentWallet: string;
  request: {
    method: string;
    path: string;
    body?: unknown;
    headers?: Record<string, string>;
  };
}

export interface PublisherPricingConfig {
  id: string;
  providerId: string;  // Gateway API field name
  basePricePer1000Rows: number;
  markupMultiplier: number;
  createdAt: string;
  updatedAt: string;
}

export interface QueryRequest {
  publisherId: string;
  agentWallet: string;
  sql: string;
}

export interface QueryResult {
  rows: unknown[];
  rowCount: number;
  estimatedCost: string;
  actualCost: string;
  executionTime: number;
  paymentRequestId?: string;
  settlement?: {
    payer: string;
    transaction: string;
    network: string;
  };
}

export interface CreditBalance {
  agentWallet: string;
  balance: string;
  reserved: string;
  available: string;
}

export interface InsufficientCreditError {
  error: string;
  minimumRequired: string;
  depositEndpoint: string;
}

/**
 * Type guard to detect insufficient credit 402 responses
 */
export function isInsufficientCreditError(value: unknown): value is InsufficientCreditError {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.error === 'string' &&
    typeof obj.minimumRequired === 'string' &&
    typeof obj.depositEndpoint === 'string'
  );
}
