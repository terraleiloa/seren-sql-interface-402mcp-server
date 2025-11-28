// ABOUTME: Tests for EIP-712 signing utilities
// ABOUTME: Tests domain, message, and typed data construction for transferWithAuthorization

import {
  buildDomain,
  buildAuthorizationMessage,
  buildTypedData,
  TRANSFER_WITH_AUTHORIZATION_TYPES,
} from '../../src/signing/eip712.js';

describe('EIP-712 Signing Utilities', () => {
  // Base mainnet USDC values
  const BASE_CHAIN_ID = 8453;
  const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

  describe('buildDomain', () => {
    it('should build EIP-712 domain for Base mainnet USDC', () => {
      const domain = buildDomain({
        chainId: BASE_CHAIN_ID,
        verifyingContract: BASE_USDC_ADDRESS,
      });

      expect(domain).toEqual({
        name: 'USD Coin',
        version: '2',
        chainId: BigInt(BASE_CHAIN_ID),
        verifyingContract: BASE_USDC_ADDRESS,
      });
    });

    it('should accept custom name and version', () => {
      const domain = buildDomain({
        chainId: 1,
        verifyingContract: '0x1234567890123456789012345678901234567890',
        name: 'Custom Token',
        version: '1',
      });

      expect(domain.name).toBe('Custom Token');
      expect(domain.version).toBe('1');
    });

    it('should convert number chainId to bigint', () => {
      const domain = buildDomain({
        chainId: 8453,
        verifyingContract: BASE_USDC_ADDRESS,
      });

      expect(typeof domain.chainId).toBe('bigint');
      expect(domain.chainId).toBe(8453n);
    });
  });

  describe('buildAuthorizationMessage', () => {
    const validParams = {
      from: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      value: '1000000', // 1 USDC in atomic units
      validAfter: 0,
      validBefore: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    };

    it('should build authorization message with nonce', () => {
      const message = buildAuthorizationMessage(validParams);

      expect(message.from).toBe(validParams.from);
      expect(message.to).toBe(validParams.to);
      expect(message.value).toBe(BigInt(validParams.value));
      expect(message.validAfter).toBe(BigInt(validParams.validAfter));
      expect(message.validBefore).toBe(BigInt(validParams.validBefore));
      expect(typeof message.nonce).toBe('string');
      expect(message.nonce).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should generate unique nonces', () => {
      const message1 = buildAuthorizationMessage(validParams);
      const message2 = buildAuthorizationMessage(validParams);

      expect(message1.nonce).not.toBe(message2.nonce);
    });

    it('should allow custom nonce', () => {
      const customNonce = '0x' + '12'.repeat(32);
      const message = buildAuthorizationMessage({
        ...validParams,
        nonce: customNonce,
      });

      expect(message.nonce).toBe(customNonce);
    });

    it('should convert string timestamps to bigint', () => {
      const message = buildAuthorizationMessage({
        ...validParams,
        validAfter: '1700000000',
        validBefore: '1800000000',
      });

      expect(message.validAfter).toBe(1700000000n);
      expect(message.validBefore).toBe(1800000000n);
    });

    it('should handle large value amounts', () => {
      const message = buildAuthorizationMessage({
        ...validParams,
        value: '999999999999999999', // Large amount
      });

      expect(message.value).toBe(999999999999999999n);
    });
  });

  describe('buildTypedData', () => {
    const domain = buildDomain({
      chainId: BASE_CHAIN_ID,
      verifyingContract: BASE_USDC_ADDRESS,
    });

    const message = {
      from: '0x1111111111111111111111111111111111111111' as `0x${string}`,
      to: '0x2222222222222222222222222222222222222222' as `0x${string}`,
      value: 1000000n,
      validAfter: 0n,
      validBefore: 1800000000n,
      nonce: ('0x' + '00'.repeat(32)) as `0x${string}`,
    };

    it('should build complete typed data structure', () => {
      const typedData = buildTypedData(domain, message);

      expect(typedData.domain).toEqual(domain);
      expect(typedData.types).toBe(TRANSFER_WITH_AUTHORIZATION_TYPES);
      expect(typedData.primaryType).toBe('TransferWithAuthorization');
      expect(typedData.message).toEqual(message);
    });

    it('should have correct EIP-712 type definitions', () => {
      const typedData = buildTypedData(domain, message);

      expect(typedData.types.TransferWithAuthorization).toEqual([
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ]);
    });
  });

  describe('TRANSFER_WITH_AUTHORIZATION_TYPES', () => {
    it('should have correct EIP-3009 type structure', () => {
      expect(TRANSFER_WITH_AUTHORIZATION_TYPES.TransferWithAuthorization).toBeDefined();
      expect(TRANSFER_WITH_AUTHORIZATION_TYPES.TransferWithAuthorization).toHaveLength(6);

      const fieldNames = TRANSFER_WITH_AUTHORIZATION_TYPES.TransferWithAuthorization.map(f => f.name);
      expect(fieldNames).toEqual(['from', 'to', 'value', 'validAfter', 'validBefore', 'nonce']);
    });
  });
});
