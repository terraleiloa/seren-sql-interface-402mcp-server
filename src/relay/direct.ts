// ABOUTME: Direct RPC transaction relay (primary method)
// ABOUTME: Submits transferWithAuthorization directly to Base via RPC

import { encodeFunctionData, createPublicClient, http, isAddress } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import type {
  TransactionRelay,
  AuthorizationParams,
  TransactionResult,
  DirectRelayConfig,
} from './types.js';
import {
  RelaySubmissionError,
  RelayNotAvailableError,
  USDC_CONTRACTS,
  DEFAULT_RPC_URLS,
} from './types.js';

/**
 * USDC transferWithAuthorization ABI
 */
const TRANSFER_WITH_AUTHORIZATION_ABI = [
  {
    name: 'transferWithAuthorization',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;

/**
 * Direct RPC relay for submitting transactions to Base
 * This is the primary relay method - always available if user has RPC access
 */
export class DirectRelay implements TransactionRelay {
  readonly chainId: number;
  private readonly rpcUrl: string;
  private readonly usdcContract: `0x${string}`;

  constructor(config: DirectRelayConfig) {
    if (!config.rpcUrl) {
      throw new Error('rpcUrl is required for DirectRelay');
    }

    this.rpcUrl = config.rpcUrl;
    this.chainId = config.chainId ?? 8453;
    this.usdcContract = USDC_CONTRACTS[this.chainId];

    if (!this.usdcContract) {
      throw new Error(`Unsupported chainId: ${this.chainId}`);
    }
  }

  /**
   * Check if the RPC endpoint is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const client = this.createClient();
      await client.getChainId();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Submit a signed authorization to the USDC contract
   * Note: For x402, the gateway typically handles settlement.
   * This method is for future use cases where MCP server submits directly.
   */
  async submitAuthorization(params: AuthorizationParams): Promise<TransactionResult> {
    // Validate params
    this.validateParams(params);

    // Parse signature into v, r, s components
    const { v, r, s } = this.parseSignature(params.signature);

    // Build transaction call data
    const callData = this.buildTransferAuthorizationCallData(params);

    try {
      const client = this.createClient();

      // For now, we simulate the call to validate it would succeed
      // Actual submission would require a wallet client with private key
      await client.call({
        to: this.usdcContract,
        data: callData,
      });

      // In a full implementation, we would:
      // 1. Use a wallet client to sign and send the transaction
      // 2. Wait for confirmation
      // 3. Return the actual tx hash

      // For now, return a placeholder indicating the call was validated
      throw new RelaySubmissionError(
        'Direct submission not implemented - gateway handles settlement',
        'direct'
      );
    } catch (error) {
      if (error instanceof RelaySubmissionError) {
        throw error;
      }
      throw new RelaySubmissionError(
        `Failed to submit authorization: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'direct',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Build the call data for transferWithAuthorization
   */
  buildTransferAuthorizationCallData(params: AuthorizationParams): `0x${string}` {
    const { v, r, s } = this.parseSignature(params.signature);

    return encodeFunctionData({
      abi: TRANSFER_WITH_AUTHORIZATION_ABI,
      functionName: 'transferWithAuthorization',
      args: [
        params.from,
        params.to,
        params.value,
        BigInt(params.validAfter),
        BigInt(params.validBefore),
        params.nonce,
        v,
        r,
        s,
      ],
    });
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

  /**
   * Create a viem public client
   */
  private createClient() {
    const chain = this.chainId === 8453 ? base : baseSepolia;

    return createPublicClient({
      chain,
      transport: http(this.rpcUrl),
    });
  }
}
