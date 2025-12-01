// ABOUTME: Tests for wallet provider types and implementations
// ABOUTME: Tests error classes and PrivateKeyWalletProvider

import {
  WalletNotConnectedError,
  WalletNotAvailableError,
  UserRejectedError,
} from '../../src/wallet/types.js';
import { PrivateKeyWalletProvider } from '../../src/wallet/privatekey.js';
import { buildDomain, buildAuthorizationMessage } from '../../src/signing/eip712.js';

describe('Wallet Error Types', () => {
  describe('WalletNotConnectedError', () => {
    it('should create error with message', () => {
      const error = new WalletNotConnectedError();
      expect(error.message).toBe('Wallet is not connected');
      expect(error.name).toBe('WalletNotConnectedError');
      expect(error instanceof Error).toBe(true);
    });

    it('should allow custom message', () => {
      const error = new WalletNotConnectedError('Custom message');
      expect(error.message).toBe('Custom message');
    });
  });

  describe('WalletNotAvailableError', () => {
    it('should create error with message', () => {
      const error = new WalletNotAvailableError();
      expect(error.message).toBe('No wallet provider available');
      expect(error.name).toBe('WalletNotAvailableError');
      expect(error instanceof Error).toBe(true);
    });

    it('should allow custom message', () => {
      const error = new WalletNotAvailableError('MetaMask not installed');
      expect(error.message).toBe('MetaMask not installed');
    });
  });

  describe('UserRejectedError', () => {
    it('should create error with message', () => {
      const error = new UserRejectedError();
      expect(error.message).toBe('User rejected the request');
      expect(error.name).toBe('UserRejectedError');
      expect(error instanceof Error).toBe(true);
    });

    it('should store error code', () => {
      const error = new UserRejectedError('Signing rejected', 4001);
      expect(error.message).toBe('Signing rejected');
      expect(error.code).toBe(4001);
    });
  });
});

describe('PrivateKeyWalletProvider', () => {
  // Test private key (DO NOT USE IN PRODUCTION - this is a well-known test key)
  const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  const EXPECTED_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

  describe('connect', () => {
    it('should connect with private key', async () => {
      const wallet = new PrivateKeyWalletProvider();
      await wallet.connect(TEST_PRIVATE_KEY);

      expect(await wallet.isConnected()).toBe(true);
    });

    it('should derive correct address from private key', async () => {
      const wallet = new PrivateKeyWalletProvider();
      await wallet.connect(TEST_PRIVATE_KEY);

      const address = await wallet.getAddress();
      expect(address.toLowerCase()).toBe(EXPECTED_ADDRESS.toLowerCase());
    });

    it('should accept private key without 0x prefix', async () => {
      const wallet = new PrivateKeyWalletProvider();
      await wallet.connect(TEST_PRIVATE_KEY.slice(2)); // Remove 0x

      expect(await wallet.isConnected()).toBe(true);
      const address = await wallet.getAddress();
      expect(address.toLowerCase()).toBe(EXPECTED_ADDRESS.toLowerCase());
    });

    it('should throw when no private key provided', async () => {
      const wallet = new PrivateKeyWalletProvider();
      // Temporarily clear env var to test error path
      const savedKey = process.env.WALLET_PRIVATE_KEY;
      delete process.env.WALLET_PRIVATE_KEY;

      try {
        await expect(wallet.connect()).rejects.toThrow('Private key required');
      } finally {
        // Restore env var
        if (savedKey) process.env.WALLET_PRIVATE_KEY = savedKey;
      }
    });
  });

  describe('disconnect', () => {
    it('should disconnect and clear state', async () => {
      const wallet = new PrivateKeyWalletProvider();
      await wallet.connect(TEST_PRIVATE_KEY);

      expect(await wallet.isConnected()).toBe(true);

      await wallet.disconnect();

      expect(await wallet.isConnected()).toBe(false);
    });
  });

  describe('getAddress', () => {
    it('should return address when connected', async () => {
      const wallet = new PrivateKeyWalletProvider();
      await wallet.connect(TEST_PRIVATE_KEY);

      const address = await wallet.getAddress();
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should throw WalletNotConnectedError when not connected', async () => {
      const wallet = new PrivateKeyWalletProvider();

      await expect(wallet.getAddress()).rejects.toThrow(WalletNotConnectedError);
    });
  });

  describe('isConnected', () => {
    it('should return false initially', async () => {
      const wallet = new PrivateKeyWalletProvider();
      expect(await wallet.isConnected()).toBe(false);
    });

    it('should return true after connect', async () => {
      const wallet = new PrivateKeyWalletProvider();
      await wallet.connect(TEST_PRIVATE_KEY);

      expect(await wallet.isConnected()).toBe(true);
    });

    it('should return false after disconnect', async () => {
      const wallet = new PrivateKeyWalletProvider();
      await wallet.connect(TEST_PRIVATE_KEY);
      await wallet.disconnect();

      expect(await wallet.isConnected()).toBe(false);
    });
  });

  describe('signTypedData', () => {
    const domain = buildDomain({
      chainId: 8453,
      verifyingContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    });

    it('should throw WalletNotConnectedError when not connected', async () => {
      const wallet = new PrivateKeyWalletProvider();

      const message = buildAuthorizationMessage({
        from: EXPECTED_ADDRESS,
        to: '0x2222222222222222222222222222222222222222',
        value: '1000000',
        validAfter: 0,
        validBefore: 1800000000,
      });

      await expect(wallet.signTypedData(domain, message)).rejects.toThrow(
        WalletNotConnectedError
      );
    });

    it('should sign typed data and return signature', async () => {
      const wallet = new PrivateKeyWalletProvider();
      await wallet.connect(TEST_PRIVATE_KEY);

      const message = buildAuthorizationMessage({
        from: EXPECTED_ADDRESS,
        to: '0x2222222222222222222222222222222222222222',
        value: '1000000',
        validAfter: 0,
        validBefore: 1800000000,
        nonce: '0x' + '00'.repeat(32), // Fixed nonce for deterministic test
      });

      const signature = await wallet.signTypedData(domain, message);

      // Signature should be 65 bytes (130 hex chars + 0x prefix)
      expect(signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
    });

    it('should produce consistent signatures for same input', async () => {
      const wallet = new PrivateKeyWalletProvider();
      await wallet.connect(TEST_PRIVATE_KEY);

      const message = buildAuthorizationMessage({
        from: EXPECTED_ADDRESS,
        to: '0x2222222222222222222222222222222222222222',
        value: '1000000',
        validAfter: 0,
        validBefore: 1800000000,
        nonce: '0x' + '11'.repeat(32), // Fixed nonce
      });

      const sig1 = await wallet.signTypedData(domain, message);
      const sig2 = await wallet.signTypedData(domain, message);

      expect(sig1).toBe(sig2);
    });
  });
});
