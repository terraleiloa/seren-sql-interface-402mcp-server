// ABOUTME: Transaction relay interface definitions
// ABOUTME: DirectRelay (primary) and PalomaRelay (fallback) must implement this interface

/**
 * Parameters for USDC transferWithAuthorization
 */
export interface AuthorizationParams {
  /** Sender address (the user's wallet) */
  from: `0x${string}`;
  /** Recipient address (gateway wallet) */
  to: `0x${string}`;
  /** Amount in atomic units (6 decimals for USDC) */
  value: bigint;
  /** Unix timestamp after which authorization is valid (usually 0) */
  validAfter: number;
  /** Unix timestamp before which authorization is valid */
  validBefore: number;
  /** 32-byte nonce as hex string */
  nonce: `0x${string}`;
  /** EIP-712 signature from the user's wallet */
  signature: `0x${string}`;
}

/**
 * Result of submitting a transaction
 */
export interface TransactionResult {
  /** Transaction hash on Base */
  txHash: `0x${string}`;
  /** Whether the transaction was confirmed */
  confirmed: boolean;
  /** Block number if confirmed */
  blockNumber?: number;
  /** Gas used if confirmed */
  gasUsed?: bigint;
}

/**
 * Transaction relay interface
 * All relay implementations must satisfy this interface
 */
export interface TransactionRelay {
  /**
   * Submit a signed transferWithAuthorization to the USDC contract
   * @param params - Authorization parameters including signature
   * @returns Transaction result with hash
   */
  submitAuthorization(params: AuthorizationParams): Promise<TransactionResult>;

  /**
   * Check if the relay is currently available
   * @returns true if relay can accept transactions
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Configuration for DirectRelay
 */
export interface DirectRelayConfig {
  /** RPC URL for Base network */
  rpcUrl: string;
  /** Chain ID (default: 8453 for Base mainnet) */
  chainId?: number;
  /** Private key for transaction submission (optional, for server-side relay) */
  privateKey?: string;
}

/**
 * Configuration for PalomaRelay
 */
export interface PalomaRelayConfig {
  /** Paloma relay endpoint */
  endpoint?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Paloma relay request format
 */
export interface PalomaRelayRequest {
  /** Target chain ID */
  chainId: number;
  /** Contract address (USDC) */
  contract: `0x${string}`;
  /** Method name */
  method: 'transferWithAuthorization';
  /** Method parameters */
  params: {
    from: `0x${string}`;
    to: `0x${string}`;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: `0x${string}`;
    v: number;
    r: `0x${string}`;
    s: `0x${string}`;
  };
}

/**
 * Paloma relay response format
 */
export interface PalomaRelayResponse {
  success: boolean;
  txHash?: `0x${string}`;
  error?: string;
  /** Validator that processed the request */
  validator?: string;
}

/**
 * Error thrown when relay submission fails
 */
export class RelaySubmissionError extends Error {
  constructor(
    message: string,
    public readonly relayType: 'direct' | 'paloma',
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'RelaySubmissionError';
    Object.setPrototypeOf(this, RelaySubmissionError.prototype);
  }
}

/**
 * Error thrown when relay is not available
 */
export class RelayNotAvailableError extends Error {
  constructor(
    public readonly relayType: 'direct' | 'paloma',
    message = `${relayType} relay is not available`
  ) {
    super(message);
    this.name = 'RelayNotAvailableError';
    Object.setPrototypeOf(this, RelayNotAvailableError.prototype);
  }
}

/**
 * USDC contract addresses by chain
 */
export const USDC_CONTRACTS: Record<number, `0x${string}`> = {
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base mainnet
  84532: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia
};

/**
 * Default RPC URLs by chain
 */
export const DEFAULT_RPC_URLS: Record<number, string> = {
  8453: 'https://mainnet.base.org',
  84532: 'https://sepolia.base.org',
};

/**
 * Default Paloma relay endpoint
 */
export const DEFAULT_PALOMA_ENDPOINT = 'https://relay.palomachain.com';
