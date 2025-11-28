// ABOUTME: Tests for transaction relay infrastructure
// ABOUTME: Tests DirectRelay (primary) and PalomaRelay (fallback)

import { jest } from '@jest/globals';
import { DirectRelay } from '../../src/relay/direct.js';
import { PalomaRelay } from '../../src/relay/paloma.js';
import type { TransactionRelay, AuthorizationParams } from '../../src/relay/types.js';

describe('TransactionRelay Interface', () => {
  // Use valid checksummed addresses for tests
  const mockAuthParams: AuthorizationParams = {
    from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as `0x${string}`,
    to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as `0x${string}`,
    value: BigInt('1500000'),
    validAfter: 0,
    validBefore: Math.floor(Date.now() / 1000) + 300,
    nonce: ('0x' + '01'.repeat(32)) as `0x${string}`,
    signature: ('0x' + '00'.repeat(65)) as `0x${string}`,
  };

  describe('DirectRelay', () => {
    let relay: DirectRelay;

    beforeEach(() => {
      relay = new DirectRelay({
        rpcUrl: 'https://mainnet.base.org',
        chainId: 8453,
      });
    });

    it('should implement TransactionRelay interface', () => {
      expect(relay.submitAuthorization).toBeDefined();
      expect(typeof relay.submitAuthorization).toBe('function');
    });

    it('should require rpcUrl in constructor', () => {
      expect(() => new DirectRelay({ rpcUrl: '', chainId: 8453 })).toThrow();
    });

    it('should use Base mainnet chainId by default', () => {
      const defaultRelay = new DirectRelay({ rpcUrl: 'https://mainnet.base.org' });
      expect(defaultRelay.chainId).toBe(8453);
    });

    it('should validate authorization params', async () => {
      const invalidParams = { ...mockAuthParams, from: 'invalid-address' as `0x${string}` };

      await expect(relay.submitAuthorization(invalidParams))
        .rejects.toThrow(/invalid/i);
    });

    it('should validate signature format', async () => {
      const invalidParams = { ...mockAuthParams, signature: 'not-a-signature' as `0x${string}` };

      await expect(relay.submitAuthorization(invalidParams))
        .rejects.toThrow(/signature/i);
    });
  });

  describe('PalomaRelay', () => {
    let relay: PalomaRelay;

    beforeEach(() => {
      relay = new PalomaRelay({
        endpoint: 'https://relay.palomachain.com',
      });
    });

    it('should implement TransactionRelay interface', () => {
      expect(relay.submitAuthorization).toBeDefined();
      expect(typeof relay.submitAuthorization).toBe('function');
    });

    it('should use default endpoint if not provided', () => {
      const defaultRelay = new PalomaRelay();
      expect(defaultRelay.endpoint).toBe('https://relay.palomachain.com');
    });

    it('should validate authorization params', async () => {
      const invalidParams = { ...mockAuthParams, from: 'invalid-address' as `0x${string}` };

      await expect(relay.submitAuthorization(invalidParams))
        .rejects.toThrow(/invalid/i);
    });

    it('should check relay availability', async () => {
      const isAvailable = await relay.isAvailable();
      expect(typeof isAvailable).toBe('boolean');
    });
  });

  describe('Relay Selection', () => {
    it('DirectRelay should be usable as TransactionRelay', () => {
      const relay: TransactionRelay = new DirectRelay({ rpcUrl: 'https://mainnet.base.org' });
      expect(relay.submitAuthorization).toBeDefined();
    });

    it('PalomaRelay should be usable as TransactionRelay', () => {
      const relay: TransactionRelay = new PalomaRelay();
      expect(relay.submitAuthorization).toBeDefined();
    });
  });
});

describe('DirectRelay Integration', () => {
  // Use valid checksummed addresses
  const validFrom = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as `0x${string}`;
  const validTo = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as `0x${string}`;

  it('should construct USDC transferWithAuthorization call data', () => {
    const relay = new DirectRelay({ rpcUrl: 'https://mainnet.base.org' });

    const callData = relay.buildTransferAuthorizationCallData({
      from: validFrom,
      to: validTo,
      value: BigInt('1500000'),
      validAfter: 0,
      validBefore: 9999999999,
      nonce: ('0x' + '01'.repeat(32)) as `0x${string}`,
      signature: ('0x' + '00'.repeat(65)) as `0x${string}`,
    });

    // Should be a hex string starting with function selector
    expect(callData).toMatch(/^0x/);
    // transferWithAuthorization selector is 0xe3ee160e
    expect(callData.slice(0, 10)).toBe('0xe3ee160e');
  });
});

describe('PalomaRelay Integration', () => {
  // Use valid checksummed addresses
  const validFrom = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as `0x${string}`;
  const validTo = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as `0x${string}`;

  it('should format relay request correctly', () => {
    const relay = new PalomaRelay();

    const request = relay.buildRelayRequest({
      from: validFrom,
      to: validTo,
      value: BigInt('1500000'),
      validAfter: 0,
      validBefore: 9999999999,
      nonce: ('0x' + '01'.repeat(32)) as `0x${string}`,
      signature: ('0x' + '00'.repeat(65)) as `0x${string}`,
    });

    expect(request).toHaveProperty('chainId');
    expect(request).toHaveProperty('contract');
    expect(request).toHaveProperty('method');
    expect(request).toHaveProperty('params');
    expect(request.chainId).toBe(8453);
    expect(request.method).toBe('transferWithAuthorization');
  });
});
