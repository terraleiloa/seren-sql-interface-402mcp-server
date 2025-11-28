// ABOUTME: Helpers for converting between decimal USDC strings and atomic units
// ABOUTME: USDC uses 6 decimal places (1 USDC = 1,000,000 atomic units)

/**
 * Converts a decimal string (e.g., "0.025") into an atomic string (e.g., "25000") with the given decimals.
 */
export function decimalToAtomic(amount: string, decimals = 6): string {
  if (!amount) {
    throw new Error('Amount is required');
  }

  const normalized = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`Invalid decimal amount: ${amount}`);
  }

  const [whole, fraction = ''] = normalized.split('.');
  const paddedFraction = (fraction + '0'.repeat(decimals)).slice(0, decimals);
  const combined = `${stripLeadingZeros(whole)}${paddedFraction}`;
  return BigInt(combined || '0').toString();
}

/**
 * Converts an atomic string (e.g., "25000") into a decimal string with the given decimals.
 */
export function atomicToDecimal(amount: string, decimals = 6): string {
  if (!/^\d+$/.test(amount)) {
    throw new Error(`Invalid atomic amount: ${amount}`);
  }
  const value = amount.padStart(decimals + 1, '0');
  const whole = value.slice(0, -decimals) || '0';
  const fraction = value.slice(-decimals);
  const trimmedFraction = fraction.replace(/0+$/, '');
  return trimmedFraction.length > 0 ? `${stripLeadingZeros(whole)}.${trimmedFraction}` : stripLeadingZeros(whole);
}

/**
 * Formats an atomic amount as a human-readable USDC string.
 */
export function formatUsdc(atomicAmount: string): string {
  return `${atomicToDecimal(atomicAmount)} USDC`;
}

function stripLeadingZeros(value: string): string {
  const trimmed = value.replace(/^0+/, '');
  return trimmed.length === 0 ? '0' : trimmed;
}
