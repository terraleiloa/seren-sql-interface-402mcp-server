// ABOUTME: Tests for confirm_deposit MCP tool
// ABOUTME: Tests confirming deposits and crediting balances via gateway

import { jest } from '@jest/globals';
import { confirmDeposit, ConfirmDepositInput } from '../../src/tools/confirmDeposit.js';
import type { WalletProvider } from '../../src/wallet/types.js';
import type { GatewayClient } from '../../src/gateway/client.js';

describe('confirmDeposit', () => {
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

  describe('successful confirmation', () => {
    it('should confirm deposit and return updated balance', async () => {
      mockGateway.confirmDeposit.mockResolvedValue({
        agentWallet: '0x1234567890123456789012345678901234567890',
        balance: '15.00',
        reserved: '0.00',
        available: '15.00',
      });

      const input: ConfirmDepositInput = {
        txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        amount: '10.00',
      };
      const result = await confirmDeposit(input, mockWallet, mockGateway);

      expect(result.success).toBe(true);
      expect(result.balance).toBe('15.00');
      expect(result.available).toBe('15.00');
      expect(mockGateway.confirmDeposit).toHaveBeenCalledWith(
        '0x1234567890123456789012345678901234567890',
        '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        '10.00'
      );
    });

    it('should return wallet address in response', async () => {
      mockGateway.confirmDeposit.mockResolvedValue({
        agentWallet: '0x1234567890123456789012345678901234567890',
        balance: '10.00',
        reserved: '0.00',
        available: '10.00',
      });

      const input: ConfirmDepositInput = {
        txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        amount: '10.00',
      };
      const result = await confirmDeposit(input, mockWallet, mockGateway);

      expect(result.wallet).toBe('0x1234567890123456789012345678901234567890');
    });
  });

  describe('validation', () => {
    it('should reject invalid txHash format', async () => {
      const input: ConfirmDepositInput = {
        txHash: 'invalid-hash',
        amount: '10.00',
      };
      const result = await confirmDeposit(input, mockWallet, mockGateway);

      expect(result.success).toBe(false);
      expect(result.error).toContain('txHash');
    });

    it('should reject txHash without 0x prefix', async () => {
      const input: ConfirmDepositInput = {
        txHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
        amount: '10.00',
      };
      const result = await confirmDeposit(input, mockWallet, mockGateway);

      expect(result.success).toBe(false);
      expect(result.error).toContain('txHash');
    });

    it('should reject invalid amount format', async () => {
      const input: ConfirmDepositInput = {
        txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        amount: 'invalid',
      };
      const result = await confirmDeposit(input, mockWallet, mockGateway);

      expect(result.success).toBe(false);
      expect(result.error).toContain('amount');
    });

    it('should reject zero amount', async () => {
      const input: ConfirmDepositInput = {
        txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        amount: '0',
      };
      const result = await confirmDeposit(input, mockWallet, mockGateway);

      expect(result.success).toBe(false);
      expect(result.error).toContain('amount');
    });

    it('should reject negative amount', async () => {
      const input: ConfirmDepositInput = {
        txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        amount: '-5.00',
      };
      const result = await confirmDeposit(input, mockWallet, mockGateway);

      expect(result.success).toBe(false);
      expect(result.error).toContain('amount');
    });
  });

  describe('error handling', () => {
    it('should handle wallet connection errors', async () => {
      mockWallet.getAddress.mockRejectedValue(new Error('Wallet not connected'));
      const input: ConfirmDepositInput = {
        txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        amount: '10.00',
      };

      const result = await confirmDeposit(input, mockWallet, mockGateway);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Wallet');
    });

    it('should handle gateway errors', async () => {
      mockGateway.confirmDeposit.mockRejectedValue(new Error('Transaction not found'));
      const input: ConfirmDepositInput = {
        txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        amount: '10.00',
      };

      const result = await confirmDeposit(input, mockWallet, mockGateway);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Transaction not found');
    });

    it('should handle duplicate confirmation attempts', async () => {
      mockGateway.confirmDeposit.mockRejectedValue(new Error('Deposit already confirmed'));
      const input: ConfirmDepositInput = {
        txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        amount: '10.00',
      };

      const result = await confirmDeposit(input, mockWallet, mockGateway);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already confirmed');
    });
  });
});
