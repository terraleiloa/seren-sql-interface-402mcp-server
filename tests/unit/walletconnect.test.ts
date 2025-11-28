// ABOUTME: Tests for WalletConnect wallet provider
// ABOUTME: Tests error classes and constructor; full integration requires manual testing

import { WalletConnectProvider, WalletConnectTimeoutError } from '../../src/wallet/walletconnect.js';
import { WalletNotAvailableError } from '../../src/wallet/types.js';

describe('WalletConnectProvider', () => {
  describe('constructor', () => {
    it('should create provider with default options', () => {
      const provider = new WalletConnectProvider();
      expect(provider).toBeDefined();
    });

    it('should accept custom chainId', () => {
      const provider = new WalletConnectProvider({ chainId: 1 });
      expect(provider).toBeDefined();
    });

    it('should accept custom metadata', () => {
      const provider = new WalletConnectProvider({
        metadata: {
          name: 'Custom App',
          description: 'Test description',
          url: 'https://example.com',
          icons: ['https://example.com/icon.png'],
        },
      });
      expect(provider).toBeDefined();
    });
  });

  describe('init', () => {
    it('should throw WalletNotAvailableError without project ID', async () => {
      // Ensure env var is not set for this test
      const originalEnv = process.env.WALLETCONNECT_PROJECT_ID;
      delete process.env.WALLETCONNECT_PROJECT_ID;

      try {
        const provider = new WalletConnectProvider();
        await expect(provider.init()).rejects.toThrow(WalletNotAvailableError);
        await expect(provider.init()).rejects.toThrow(
          'WalletConnect project ID required'
        );
      } finally {
        if (originalEnv) {
          process.env.WALLETCONNECT_PROJECT_ID = originalEnv;
        }
      }
    });
  });

  describe('methods without init', () => {
    it('createPairing should throw if not initialized', async () => {
      const provider = new WalletConnectProvider();
      await expect(provider.createPairing()).rejects.toThrow(WalletNotAvailableError);
    });

    it('connect should throw if not initialized', async () => {
      const provider = new WalletConnectProvider();
      await expect(provider.connect()).rejects.toThrow(WalletNotAvailableError);
    });

    it('isConnected should return false when not initialized', async () => {
      const provider = new WalletConnectProvider();
      expect(await provider.isConnected()).toBe(false);
    });

    it('getSessionTopic should return null when not connected', () => {
      const provider = new WalletConnectProvider();
      expect(provider.getSessionTopic()).toBeNull();
    });
  });
});

describe('WalletConnectTimeoutError', () => {
  it('should create error with default message', () => {
    const error = new WalletConnectTimeoutError();
    expect(error.message).toBe('WalletConnect connection timed out');
    expect(error.name).toBe('WalletConnectTimeoutError');
    expect(error instanceof Error).toBe(true);
  });

  it('should allow custom message', () => {
    const error = new WalletConnectTimeoutError('Custom timeout message');
    expect(error.message).toBe('Custom timeout message');
  });

  it('should have correct prototype chain', () => {
    const error = new WalletConnectTimeoutError();
    expect(error instanceof WalletConnectTimeoutError).toBe(true);
    expect(error instanceof Error).toBe(true);
  });
});

/**
 * NOTE: Full WalletConnect integration tests require:
 * 1. A valid WalletConnect Cloud project ID
 * 2. A mobile wallet app (MetaMask, Rainbow, etc.)
 * 3. Manual QR code scanning or deep link approval
 *
 * These tests verify the provider's interface and error handling.
 * Full e2e testing should be done manually or in a CI environment
 * with a WalletConnect test wallet.
 */
