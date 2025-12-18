// ABOUTME: Tests for deposit_credits MCP tool
// ABOUTME: Tests deposit instructions and gateway address retrieval

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock the config module before importing depositCredits
jest.unstable_mockModule('../../src/config/index.js', () => ({
  config: {
    GATEWAY_DEPOSIT_WALLET: '0xTestDepositWallet1234567890123456789012',
    X402_GATEWAY_URL: 'https://x402.serendb.com',
    WALLET_TYPE: 'browser',
    BASE_RPC_URL: 'https://mainnet.base.org',
    NODE_ENV: 'test',
    LOG_LEVEL: 'info',
  },
}));

// Dynamic import after mocking
const { depositCredits } = await import('../../src/tools/depositCredits.js');
type DepositCreditsInput = { amount: string };
import type { WalletProvider } from '../../src/wallet/types.js';
import type { GatewayClient } from '../../src/gateway/client.js';

describe('depositCredits', () => {
  let mockWallet: jest.Mocked<WalletProvider>;
  let mockGateway: jest.Mocked<GatewayClient>;

  beforeEach(() => {
    mockWallet = {
      getAddress: jest.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
      signTypedData: jest.fn(),
      isConnected: jest.fn().mockResolvedValue(true),
      connect: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as jest.Mocked<WalletProvider>;

    mockGateway = {
      getCreditBalance: jest.fn(),
      confirmDeposit: jest.fn(),
      listPublishers: jest.fn(),
      getPublisher: jest.fn(),
      proxyRequest: jest.fn(),
      encodePaymentPayload: jest.fn(),
      decodePaymentResponse: jest.fn(),
    } as unknown as jest.Mocked<GatewayClient>;
  });

  describe('deposit instructions', () => {
    it('should return deposit instructions with gateway wallet address', async () => {
      const input: DepositCreditsInput = { amount: '10.00' };
      const result = await depositCredits(input, mockWallet, mockGateway);

      expect(result.success).toBe(true);
      expect(result.instructions).toBeDefined();
      expect(result.amount).toBe('10.00');
      expect(result.gatewayWallet).toBe('0xTestDepositWallet1234567890123456789012');
    });

    it('should include step-by-step instructions', async () => {
      const input: DepositCreditsInput = { amount: '5.00' };
      const result = await depositCredits(input, mockWallet, mockGateway);

      expect(result.success).toBe(true);
      expect(result.steps).toBeDefined();
      expect(result.steps?.length).toBeGreaterThan(0);
    });

    it('should include agent wallet address in instructions', async () => {
      const input: DepositCreditsInput = { amount: '10.00' };
      const result = await depositCredits(input, mockWallet, mockGateway);

      expect(result.agentWallet).toBe('0x1234567890123456789012345678901234567890');
    });

    it('should mention confirm_deposit in instructions', async () => {
      const input: DepositCreditsInput = { amount: '10.00' };
      const result = await depositCredits(input, mockWallet, mockGateway);

      expect(result.instructions).toContain('confirm_deposit');
    });
  });

  describe('validation', () => {
    it('should reject invalid amount format', async () => {
      const input: DepositCreditsInput = { amount: 'invalid' };
      const result = await depositCredits(input, mockWallet, mockGateway);

      expect(result.success).toBe(false);
      expect(result.error).toContain('amount');
    });

    it('should reject zero amount', async () => {
      const input: DepositCreditsInput = { amount: '0' };
      const result = await depositCredits(input, mockWallet, mockGateway);

      expect(result.success).toBe(false);
      expect(result.error).toContain('amount');
    });

    it('should reject negative amount', async () => {
      const input: DepositCreditsInput = { amount: '-5.00' };
      const result = await depositCredits(input, mockWallet, mockGateway);

      expect(result.success).toBe(false);
      expect(result.error).toContain('amount');
    });
  });

  describe('error handling', () => {
    it('should handle wallet connection errors', async () => {
      mockWallet.getAddress.mockRejectedValue(new Error('Wallet not connected'));
      const input: DepositCreditsInput = { amount: '10.00' };

      const result = await depositCredits(input, mockWallet, mockGateway);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Wallet');
    });
  });
});

describe('depositCredits without config', () => {
  it('should fail when GATEWAY_DEPOSIT_WALLET is not configured', async () => {
    // Reset modules to test without config
    jest.resetModules();

    // Mock config without GATEWAY_DEPOSIT_WALLET
    jest.unstable_mockModule('../../src/config/index.js', () => ({
      config: {
        GATEWAY_DEPOSIT_WALLET: undefined,
        X402_GATEWAY_URL: 'https://x402.serendb.com',
        WALLET_TYPE: 'browser',
        BASE_RPC_URL: 'https://mainnet.base.org',
        NODE_ENV: 'test',
        LOG_LEVEL: 'info',
      },
    }));

    const { depositCredits: depositCreditsNoConfig } = await import('../../src/tools/depositCredits.js');

    const mockWallet = {
      getAddress: jest.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
      signTypedData: jest.fn(),
      isConnected: jest.fn().mockResolvedValue(true),
      connect: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as jest.Mocked<WalletProvider>;

    const mockGateway = {
      getCreditBalance: jest.fn(),
      confirmDeposit: jest.fn(),
    } as unknown as jest.Mocked<GatewayClient>;

    const result = await depositCreditsNoConfig({ amount: '10.00' }, mockWallet, mockGateway);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Deposit wallet not configured');
  });
});
