// ABOUTME: Paloma validator relay (fallback method)
// ABOUTME: Submits transactions via Paloma decentralized validator network

import { isAddress } from 'viem';
import type {
  TransactionRelay,
  AuthorizationParams,
  TransactionResult,
  PalomaRelayConfig,
  PalomaRelayRequest,
  PalomaRelayResponse,
} from './types.js';
import {
  RelaySubmissionError,
  RelayNotAvailableError,
  USDC_CONTRACTS,
  DEFAULT_PALOMA_ENDPOINT,
} from './types.js';

/**
 * Paloma relay for submitting transactions via validator network
 * This is a fallback method - used when user doesn't have RPC access
 * Note: Requires Paloma validator set to be operational
 */
export class PalomaRelay implements TransactionRelay {
  readonly endpoint: string;
  readonly chainId: number = 8453; // Base mainnet
  private readonly timeout: number;
  private readonly usdcContract: `0x${string}`;

  constructor(config: PalomaRelayConfig = {}) {
    this.endpoint = config.endpoint ?? DEFAULT_PALOMA_ENDPOINT;
    this.timeout = config.timeout ?? 30000; // 30 seconds default
    this.usdcContract = USDC_CONTRACTS[this.chainId];
  }

  /**
   * Check if Paloma relay is available
   * Pings the endpoint to verify validator set is operational
   */
  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.endpoint}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Submit a signed authorization via Paloma validators
   */
  async submitAuthorization(params: AuthorizationParams): Promise<TransactionResult> {
    // Validate params
    this.validateParams(params);

    // Check availability first
    const available = await this.isAvailable();
    if (!available) {
      throw new RelayNotAvailableError('paloma', 'Paloma validator set is not currently available');
    }

    // Build the relay request
    const request = this.buildRelayRequest(params);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.endpoint}/relay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        throw new RelaySubmissionError(
          `Paloma relay failed: ${errorData.error ?? response.statusText}`,
          'paloma'
        );
      }

      const result = (await response.json()) as PalomaRelayResponse;

      if (!result.success || !result.txHash) {
        throw new RelaySubmissionError(
          `Paloma relay failed: ${result.error ?? 'No transaction hash returned'}`,
          'paloma'
        );
      }

      return {
        txHash: result.txHash,
        confirmed: true, // Paloma waits for confirmation
        blockNumber: undefined, // Could be added if Paloma returns it
      };
    } catch (error) {
      if (error instanceof RelaySubmissionError) {
        throw error;
      }
      if (error instanceof RelayNotAvailableError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new RelaySubmissionError(`Paloma relay failed: ${message}`, 'paloma');
    }
  }

  /**
   * Build a Paloma relay request
   */
  buildRelayRequest(params: AuthorizationParams): PalomaRelayRequest {
    const { v, r, s } = this.parseSignature(params.signature);

    return {
      chainId: this.chainId,
      contract: this.usdcContract,
      method: 'transferWithAuthorization',
      params: {
        from: params.from,
        to: params.to,
        value: params.value.toString(),
        validAfter: params.validAfter.toString(),
        validBefore: params.validBefore.toString(),
        nonce: params.nonce,
        v,
        r,
        s,
      },
    };
  }

  /**
   * Validate authorization parameters
   */
  private validateParams(params: AuthorizationParams): void {
    if (!isAddress(params.from)) {
      throw new Error(`Invalid from address: ${params.from}`);
    }
    if (!isAddress(params.to)) {
      throw new Error(`Invalid to address: ${params.to}`);
    }
    if (!params.signature.match(/^0x[a-fA-F0-9]{130}$/)) {
      throw new Error(`Invalid signature format: must be 65 bytes hex`);
    }
    if (!params.nonce.match(/^0x[a-fA-F0-9]{64}$/)) {
      throw new Error(`Invalid nonce format: must be 32 bytes hex`);
    }
  }

  /**
   * Parse a signature into v, r, s components
   */
  private parseSignature(signature: `0x${string}`): {
    v: number;
    r: `0x${string}`;
    s: `0x${string}`;
  } {
    // Remove 0x prefix
    const sig = signature.slice(2);

    // Split into r (32 bytes), s (32 bytes), v (1 byte)
    const r = `0x${sig.slice(0, 64)}` as `0x${string}`;
    const s = `0x${sig.slice(64, 128)}` as `0x${string}`;
    let v = parseInt(sig.slice(128, 130), 16);

    // Handle EIP-155 v values
    if (v < 27) {
      v += 27;
    }

    return { v, r, s };
  }
}
