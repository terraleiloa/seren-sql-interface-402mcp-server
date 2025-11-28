// ABOUTME: WalletConnect wallet provider for production use
// ABOUTME: Enables signing via mobile wallet QR code in Node.js/IDE environments

import { SignClient } from '@walletconnect/sign-client';
import type { SessionTypes, SignClientTypes } from '@walletconnect/types';
import type { WalletProvider } from './types.js';
import { WalletNotConnectedError, WalletNotAvailableError } from './types.js';
import type { Eip712Domain, TransferAuthorizationMessage } from '../signing/eip712.js';
import { TRANSFER_WITH_AUTHORIZATION_TYPES } from '../signing/eip712.js';

/**
 * Error thrown when WalletConnect connection times out
 */
export class WalletConnectTimeoutError extends Error {
  constructor(message = 'WalletConnect connection timed out') {
    super(message);
    this.name = 'WalletConnectTimeoutError';
    Object.setPrototypeOf(this, WalletConnectTimeoutError.prototype);
  }
}

export interface WalletConnectProviderOptions {
  chainId?: number;
  metadata?: SignClientTypes.Metadata;
}

/**
 * WalletConnect wallet provider for production use.
 * Connects to mobile wallets via QR code pairing.
 */
export class WalletConnectProvider implements WalletProvider {
  private client: InstanceType<typeof SignClient> | null = null;
  private session: SessionTypes.Struct | null = null;
  private chainId: number;
  private metadata: SignClientTypes.Metadata;

  constructor(options: WalletConnectProviderOptions = {}) {
    this.chainId = options.chainId ?? 8453; // Base mainnet
    this.metadata = options.metadata ?? {
      name: 'x402 MCP Server',
      description: 'AI Agent Payment Client using x402 Protocol',
      url: 'https://github.com/serenorg/x402-mcp-server',
      icons: ['https://avatars.githubusercontent.com/u/37784886'],
    };
  }

  /**
   * Initialize the WalletConnect client
   * @param projectId - WalletConnect Cloud project ID
   */
  async init(projectId?: string): Promise<void> {
    const wcProjectId = projectId ?? process.env.WALLETCONNECT_PROJECT_ID;

    if (!wcProjectId) {
      throw new WalletNotAvailableError(
        'WalletConnect project ID required. Set WALLETCONNECT_PROJECT_ID or pass to init()'
      );
    }

    this.client = await SignClient.init({
      projectId: wcProjectId,
      metadata: this.metadata,
    });

    // Set up event listeners
    this.client.on('session_delete', () => {
      this.session = null;
    });
  }

  /**
   * Create a pairing URI for QR code display
   * @returns Object with URI for QR code and approval promise
   */
  async createPairing(): Promise<{
    uri: string;
    approval: () => Promise<SessionTypes.Struct>;
  }> {
    if (!this.client) {
      throw new WalletNotAvailableError('WalletConnect client not initialized. Call init() first.');
    }

    const { uri, approval } = await this.client.connect({
      requiredNamespaces: {
        eip155: {
          methods: ['eth_signTypedData_v4'],
          chains: [`eip155:${this.chainId}`],
          events: ['accountsChanged', 'chainChanged'],
        },
      },
    });

    if (!uri) {
      throw new WalletNotAvailableError('Failed to generate WalletConnect pairing URI');
    }

    return {
      uri,
      approval: async () => {
        const session = await approval();
        this.session = session;
        return session;
      },
    };
  }

  /**
   * Connect to wallet. Restores existing session or creates new pairing.
   */
  async connect(): Promise<void> {
    if (!this.client) {
      throw new WalletNotAvailableError('WalletConnect client not initialized. Call init() first.');
    }

    // Check for existing sessions
    const sessions = this.client.session.getAll();
    if (sessions.length > 0) {
      // Find session with matching chain
      const matchingSession = sessions.find((s) =>
        s.namespaces.eip155?.accounts.some((a) => a.startsWith(`eip155:${this.chainId}:`))
      );

      if (matchingSession) {
        this.session = matchingSession;
        return;
      }
    }

    // No existing session, create new pairing
    const { approval } = await this.createPairing();
    await approval();
  }

  /**
   * Disconnect from wallet
   */
  async disconnect(): Promise<void> {
    if (this.client && this.session) {
      try {
        await this.client.disconnect({
          topic: this.session.topic,
          reason: {
            code: 6000,
            message: 'User disconnected',
          },
        });
      } catch {
        // Ignore disconnect errors
      }
    }
    this.session = null;
  }

  /**
   * Check if wallet is connected
   */
  async isConnected(): Promise<boolean> {
    return this.session !== null;
  }

  /**
   * Get connected wallet address
   */
  async getAddress(): Promise<`0x${string}`> {
    if (!this.session) {
      throw new WalletNotConnectedError();
    }

    const accounts = this.session.namespaces.eip155?.accounts || [];
    const account = accounts.find((a) => a.startsWith(`eip155:${this.chainId}:`));

    if (!account) {
      throw new WalletNotConnectedError('No account found for configured chain');
    }

    // Format: eip155:chainId:address
    const address = account.split(':')[2];
    return address as `0x${string}`;
  }

  /**
   * Sign EIP-712 typed data via WalletConnect
   */
  async signTypedData(
    domain: Eip712Domain,
    message: TransferAuthorizationMessage
  ): Promise<`0x${string}`> {
    if (!this.client || !this.session) {
      throw new WalletNotConnectedError();
    }

    const address = await this.getAddress();

    // Build EIP-712 typed data structure
    const typedData = {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        TransferWithAuthorization: TRANSFER_WITH_AUTHORIZATION_TYPES.TransferWithAuthorization,
      },
      primaryType: 'TransferWithAuthorization',
      domain: {
        name: domain.name,
        version: domain.version,
        chainId: Number(domain.chainId),
        verifyingContract: domain.verifyingContract,
      },
      message: {
        from: message.from,
        to: message.to,
        value: message.value.toString(),
        validAfter: message.validAfter.toString(),
        validBefore: message.validBefore.toString(),
        nonce: message.nonce,
      },
    };

    const signature = await this.client.request<string>({
      topic: this.session.topic,
      chainId: `eip155:${this.chainId}`,
      request: {
        method: 'eth_signTypedData_v4',
        params: [address, JSON.stringify(typedData)],
      },
    });

    return signature as `0x${string}`;
  }

  /**
   * Get the pairing URI for display (e.g., QR code)
   * This is a convenience method that creates a pairing and returns just the URI
   */
  async getPairingUri(): Promise<string> {
    const { uri } = await this.createPairing();
    return uri;
  }

  /**
   * Get the current session topic (useful for debugging)
   */
  getSessionTopic(): string | null {
    return this.session?.topic ?? null;
  }
}
