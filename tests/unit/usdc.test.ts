// ABOUTME: Tests for USDC amount conversion utilities
// ABOUTME: Tests decimal/atomic conversions and formatting

import { decimalToAtomic, atomicToDecimal, formatUsdc } from '../../src/utils/usdc.js';

describe('USDC Utilities', () => {
  describe('decimalToAtomic', () => {
    it('should convert whole number', () => {
      expect(decimalToAtomic('1')).toBe('1000000');
      expect(decimalToAtomic('100')).toBe('100000000');
    });

    it('should convert decimal with 6 places', () => {
      expect(decimalToAtomic('0.000001')).toBe('1');
      expect(decimalToAtomic('0.123456')).toBe('123456');
    });

    it('should convert decimal with fewer than 6 places', () => {
      expect(decimalToAtomic('0.1')).toBe('100000');
      expect(decimalToAtomic('0.025')).toBe('25000');
      expect(decimalToAtomic('1.5')).toBe('1500000');
    });

    it('should handle small amounts', () => {
      expect(decimalToAtomic('0.01')).toBe('10000');
      expect(decimalToAtomic('0.001')).toBe('1000');
    });

    it('should handle large amounts', () => {
      expect(decimalToAtomic('1000000')).toBe('1000000000000');
      expect(decimalToAtomic('999999.999999')).toBe('999999999999');
    });

    it('should truncate beyond 6 decimal places', () => {
      expect(decimalToAtomic('0.1234567')).toBe('123456');
      expect(decimalToAtomic('1.99999999')).toBe('1999999');
    });

    it('should handle zero', () => {
      expect(decimalToAtomic('0')).toBe('0');
      expect(decimalToAtomic('0.000000')).toBe('0');
    });

    it('should throw on empty string', () => {
      expect(() => decimalToAtomic('')).toThrow('Amount is required');
    });

    it('should throw on invalid format', () => {
      expect(() => decimalToAtomic('abc')).toThrow('Invalid decimal amount');
      expect(() => decimalToAtomic('-1')).toThrow('Invalid decimal amount');
      expect(() => decimalToAtomic('1.2.3')).toThrow('Invalid decimal amount');
    });
  });

  describe('atomicToDecimal', () => {
    it('should convert atomic to decimal', () => {
      expect(atomicToDecimal('1000000')).toBe('1');
      expect(atomicToDecimal('100000000')).toBe('100');
    });

    it('should handle fractional amounts', () => {
      expect(atomicToDecimal('1')).toBe('0.000001');
      expect(atomicToDecimal('123456')).toBe('0.123456');
      expect(atomicToDecimal('25000')).toBe('0.025');
    });

    it('should handle mixed amounts', () => {
      expect(atomicToDecimal('1500000')).toBe('1.5');
      expect(atomicToDecimal('10000')).toBe('0.01');
    });

    it('should trim trailing zeros', () => {
      expect(atomicToDecimal('100000')).toBe('0.1');
      expect(atomicToDecimal('1000000')).toBe('1');
    });

    it('should handle zero', () => {
      expect(atomicToDecimal('0')).toBe('0');
    });

    it('should handle large amounts', () => {
      expect(atomicToDecimal('1000000000000')).toBe('1000000');
      expect(atomicToDecimal('999999999999')).toBe('999999.999999');
    });

    it('should throw on invalid format', () => {
      expect(() => atomicToDecimal('abc')).toThrow('Invalid atomic amount');
      expect(() => atomicToDecimal('-1')).toThrow('Invalid atomic amount');
      expect(() => atomicToDecimal('1.5')).toThrow('Invalid atomic amount');
    });
  });

  describe('formatUsdc', () => {
    it('should format with USDC suffix', () => {
      expect(formatUsdc('1000000')).toBe('1 USDC');
      expect(formatUsdc('25000')).toBe('0.025 USDC');
    });

    it('should format large amounts', () => {
      expect(formatUsdc('100000000')).toBe('100 USDC');
      expect(formatUsdc('1000000000000')).toBe('1000000 USDC');
    });

    it('should format small amounts', () => {
      expect(formatUsdc('1')).toBe('0.000001 USDC');
      expect(formatUsdc('100')).toBe('0.0001 USDC');
    });
  });

  describe('roundtrip conversion', () => {
    it('should convert decimal to atomic and back', () => {
      const values = ['1', '0.025', '100.5', '0.000001', '999999.999999'];
      for (const value of values) {
        const atomic = decimalToAtomic(value);
        const decimal = atomicToDecimal(atomic);
        expect(decimal).toBe(value);
      }
    });
  });
});
