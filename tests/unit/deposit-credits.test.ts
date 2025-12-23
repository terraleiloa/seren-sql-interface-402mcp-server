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
      signTypedData: jest.fn().mockResolvedValue('0xmocksignature'),
      isConnected: jest.fn().mockResolvedValue(true),
      connect: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as jest.Mocked<WalletProvider>;

    mockGateway = {
      getCreditBalance: jest.fn(),
      confirmDeposit: jest.fn(),
      depositCredits: jest.fn(),
      listPublishers: jest.fn(),
      getPublisher: jest.fn(),
      proxyRequest: jest.fn(),
      encodePaymentPayload: jest.fn(),
      decodePaymentResponse: jest.fn(),
    } as unknown as jest.Mocked<GatewayClient>;
  });

  describe('successful deposit flow', () => {
    it('should complete deposit when gateway returns 402 then success', async () => {
      // First call returns 402 with payment requirements
      mockGateway.depositCredits
        .mockResolvedValueOnce({
          status: 402,
          paymentRequired: {
            x402Version: 1,
            accepts: [{
              scheme: 'exact',
              network: 'base',
              maxAmountRequired: '10000000',
              asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
              payTo: '0xGatewayWallet',
              resource: '/deposit',
              description: 'Deposit',
              mimeType: 'application/json',
              outputSchema: null,
              maxTimeoutSeconds: 300,
            }],
          },
        })
        // Second call (with payment) returns success
        .mockResolvedValueOnce({
          status: 200,
          data: {
            deposited: '10.00',
            balance: {
              agentWallet: '0x1234567890123456789012345678901234567890',
              balance: '10.00',
              reserved: '0.00',
              available: '10.00',
            },
            transaction: '0xTxHash123',
          },
        });

      const input: DepositCreditsInput = { amount: '10.00' };
      const result = await depositCredits(input, mockWallet, mockGateway);

      expect(result.success).toBe(true);
      expect(result.deposited).toBe('10.00');
      expect(result.balance?.available).toBe('10.00');
      expect(result.txHash).toBe('0xTxHash123');
    });

    it('should return balance info on successful deposit', async () => {
      mockGateway.depositCredits
        .mockResolvedValueOnce({
          status: 402,
          paymentRequired: {
            x402Version: 1,
            accepts: [{
              scheme: 'exact',
              network: 'base',
              maxAmountRequired: '5000000',
              asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
              payTo: '0xGatewayWallet',
              resource: '/deposit',
              description: 'Deposit',
              mimeType: 'application/json',
              outputSchema: null,
              maxTimeoutSeconds: 300,
            }],
          },
        })
        .mockResolvedValueOnce({
          status: 200,
          data: {
            deposited: '5.00',
            balance: {
              agentWallet: '0x1234567890123456789012345678901234567890',
              balance: '15.00',
              reserved: '2.00',
              available: '13.00',
            },
            transaction: '0xTxHash456',
          },
        });

      const input: DepositCreditsInput = { amount: '5.00' };
      const result = await depositCredits(input, mockWallet, mockGateway);

      expect(result.success).toBe(true);
      expect(result.balance).toBeDefined();
      expect(result.balance?.balance).toBe('15.00');
      expect(result.balance?.available).toBe('13.00');
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

describe('depositCredits error handling', () => {
  it('should fail when gateway returns error', async () => {
    const mockWallet = {
      getAddress: jest.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
      signTypedData: jest.fn(),
      isConnected: jest.fn().mockResolvedValue(true),
      connect: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as jest.Mocked<WalletProvider>;

    const mockGateway = {
      depositCredits: jest.fn().mockRejectedValue(new Error('Gateway unavailable')),
    } as unknown as jest.Mocked<GatewayClient>;

    const result = await depositCredits({ amount: '10.00' }, mockWallet, mockGateway);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Gateway unavailable');
  });

  it('should fail when payment settlement fails', async () => {
    const mockWallet = {
      getAddress: jest.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
      signTypedData: jest.fn().mockResolvedValue('0xmocksignature'),
      isConnected: jest.fn().mockResolvedValue(true),
      connect: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as jest.Mocked<WalletProvider>;

    const mockGateway = {
      depositCredits: jest.fn()
        .mockResolvedValueOnce({
          status: 402,
          paymentRequired: {
            x402Version: 1,
            accepts: [{
              scheme: 'exact',
              network: 'base',
              maxAmountRequired: '10000000',
              asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
              payTo: '0xGatewayWallet',
              resource: '/deposit',
              description: 'Deposit',
              mimeType: 'application/json',
              outputSchema: null,
              maxTimeoutSeconds: 300,
            }],
          },
        })
        // Second call returns 402 (settlement failed)
        .mockResolvedValueOnce({
          status: 402,
          paymentRequired: {
            error: 'Insufficient funds',
          },
        }),
    } as unknown as jest.Mocked<GatewayClient>;

    const result = await depositCredits({ amount: '10.00' }, mockWallet, mockGateway);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient funds');
  });
});
