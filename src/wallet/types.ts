// ABOUTME: Wallet provider interface and error types
// ABOUTME: Defines contract for all wallet implementations (browser, WalletConnect, etc.)

import type { Eip712Domain, TransferAuthorizationMessage } from '../signing/eip712.js';

/**
 * Common interface for all wallet providers
 */
export interface WalletProvider {
  /**
   * Get the connected wallet address
   * @throws WalletNotConnectedError if not connected
   */
  getAddress(): Promise<`0x${string}`>;

  /**
   * Sign EIP-712 typed data for transferWithAuthorization
   * @throws WalletNotConnectedError if not connected
   * @throws UserRejectedError if user rejects the signature
   */
  signTypedData(
    domain: Eip712Domain,
    message: TransferAuthorizationMessage
  ): Promise<`0x${string}`>;

  /**
   * Check if wallet is currently connected
   */
  isConnected(): Promise<boolean>;

  /**
   * Connect to the wallet
   * @throws WalletNotAvailableError if wallet is not available
   * @throws UserRejectedError if user rejects the connection
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the wallet
   */
  disconnect(): Promise<void>;
}

/**
 * Error thrown when wallet operation is attempted without connection
 */
export class WalletNotConnectedError extends Error {
  constructor(message = 'Wallet is not connected') {
    super(message);
    this.name = 'WalletNotConnectedError';
    Object.setPrototypeOf(this, WalletNotConnectedError.prototype);
  }
}

/**
 * Error thrown when wallet provider is not available (e.g., MetaMask not installed)
 */
export class WalletNotAvailableError extends Error {
  constructor(message = 'No wallet provider available') {
    super(message);
    this.name = 'WalletNotAvailableError';
    Object.setPrototypeOf(this, WalletNotAvailableError.prototype);
  }
}

/**
 * Error thrown when user rejects a wallet operation
 */
export class UserRejectedError extends Error {
  code?: number;

  constructor(message = 'User rejected the request', code?: number) {
    super(message);
    this.name = 'UserRejectedError';
    this.code = code;
    Object.setPrototypeOf(this, UserRejectedError.prototype);
  }
}
