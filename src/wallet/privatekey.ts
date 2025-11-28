// ABOUTME: Private key wallet provider for development and testing
// ABOUTME: Signs EIP-712 data using a provided private key via viem

import {
  createWalletClient,
  http,
  type WalletClient,
  type Chain,
  type PrivateKeyAccount,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

import type { WalletProvider } from './types.js';
import { WalletNotConnectedError } from './types.js';
import type { Eip712Domain, TransferAuthorizationMessage } from '../signing/eip712.js';
import { TRANSFER_WITH_AUTHORIZATION_TYPES } from '../signing/eip712.js';

/**
 * Private key wallet provider for development and testing
 * NOT recommended for production - use WalletConnect instead
 */
export class PrivateKeyWalletProvider implements WalletProvider {
  private client: WalletClient | null = null;
  private account: PrivateKeyAccount | null = null;
  private chain: Chain;
  private rpcUrl: string;

  constructor(options: { chain?: Chain; rpcUrl?: string } = {}) {
    this.chain = options.chain ?? base;
    this.rpcUrl = options.rpcUrl ?? 'https://mainnet.base.org';
  }

  /**
   * Connect using a private key
   * @param privateKey - Hex-encoded private key (with or without 0x prefix)
   */
  async connect(privateKey?: string): Promise<void> {
    if (!privateKey) {
      // Try to get from environment
      privateKey = process.env.WALLET_PRIVATE_KEY;
    }

    if (!privateKey) {
      throw new Error('Private key required. Set WALLET_PRIVATE_KEY or pass to connect()');
    }

    // Ensure 0x prefix
    const formattedKey = privateKey.startsWith('0x')
      ? privateKey as `0x${string}`
      : `0x${privateKey}` as `0x${string}`;

    this.account = privateKeyToAccount(formattedKey);
    this.client = createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: http(this.rpcUrl),
    });
  }

  async disconnect(): Promise<void> {
    this.client = null;
    this.account = null;
  }

  async isConnected(): Promise<boolean> {
    return this.account !== null && this.client !== null;
  }

  async getAddress(): Promise<`0x${string}`> {
    if (!this.account) {
      throw new WalletNotConnectedError();
    }
    return this.account.address;
  }

  async signTypedData(
    domain: Eip712Domain,
    message: TransferAuthorizationMessage
  ): Promise<`0x${string}`> {
    if (!this.client || !this.account) {
      throw new WalletNotConnectedError();
    }

    const signature = await this.client.signTypedData({
      account: this.account,
      domain: {
        name: domain.name,
        version: domain.version,
        chainId: domain.chainId,
        verifyingContract: domain.verifyingContract,
      },
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      primaryType: 'TransferWithAuthorization',
      message: {
        from: message.from,
        to: message.to,
        value: message.value,
        validAfter: message.validAfter,
        validBefore: message.validBefore,
        nonce: message.nonce,
      },
    });

    return signature;
  }
}
