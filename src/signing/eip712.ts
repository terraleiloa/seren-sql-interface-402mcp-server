// ABOUTME: EIP-712 typed data construction for USDC transferWithAuthorization
// ABOUTME: Builds domain, message, and typed data structures for wallet signing

import { randomBytes } from 'crypto';

/**
 * EIP-712 domain for USDC transferWithAuthorization
 */
export interface Eip712Domain {
  name: string;
  version: string;
  chainId: bigint;
  verifyingContract: `0x${string}`;
}

/**
 * EIP-3009 TransferWithAuthorization message
 */
export interface TransferAuthorizationMessage {
  from: `0x${string}`;
  to: `0x${string}`;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: `0x${string}`;
}

/**
 * Complete EIP-712 typed data structure
 */
export interface Eip712TypedData {
  domain: Eip712Domain;
  types: typeof TRANSFER_WITH_AUTHORIZATION_TYPES;
  primaryType: 'TransferWithAuthorization';
  message: TransferAuthorizationMessage;
}

/**
 * EIP-712 type definitions for TransferWithAuthorization (EIP-3009)
 */
export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

/**
 * Parameters for building EIP-712 domain
 */
export interface BuildDomainParams {
  chainId: number;
  verifyingContract: string;
  name?: string;
  version?: string;
}

/**
 * Builds the EIP-712 domain for USDC transferWithAuthorization
 */
export function buildDomain(params: BuildDomainParams): Eip712Domain {
  return {
    name: params.name ?? 'USD Coin',
    version: params.version ?? '2',
    chainId: BigInt(params.chainId),
    verifyingContract: params.verifyingContract as `0x${string}`,
  };
}

/**
 * Parameters for building authorization message
 */
export interface BuildAuthorizationParams {
  from: string;
  to: string;
  value: string | bigint;
  validAfter: string | number | bigint;
  validBefore: string | number | bigint;
  nonce?: string;
}

/**
 * Builds the TransferWithAuthorization message
 */
export function buildAuthorizationMessage(params: BuildAuthorizationParams): TransferAuthorizationMessage {
  return {
    from: params.from as `0x${string}`,
    to: params.to as `0x${string}`,
    value: BigInt(params.value),
    validAfter: BigInt(params.validAfter),
    validBefore: BigInt(params.validBefore),
    nonce: (params.nonce ?? generateNonce()) as `0x${string}`,
  };
}

/**
 * Builds complete EIP-712 typed data structure for signing
 */
export function buildTypedData(
  domain: Eip712Domain,
  message: TransferAuthorizationMessage
): Eip712TypedData {
  return {
    domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    message,
  };
}

/**
 * Generates a random 32-byte nonce as hex string
 */
export function generateNonce(): `0x${string}` {
  return `0x${randomBytes(32).toString('hex')}` as `0x${string}`;
}
