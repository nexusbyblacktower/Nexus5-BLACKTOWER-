import crypto from 'crypto';

const KEY_ENV = 'MEMORY_ENCRYPTION_KEY';

export class EncryptionUnavailableError extends Error {
  constructor() {
    super('Encryption key is not configured on the server.');
    this.name = 'EncryptionUnavailableError';
  }
}

function rawKey(): string | null {
  const value = process.env[KEY_ENV]?.trim();
  return value ? value : null;
}

export function isEncryptionConfigured(): boolean {
  return Boolean(rawKey());
}

let cache: { source: string; key: Buffer } | null = null;

function key(): Buffer {
  const raw = rawKey();
  if (!raw) throw new EncryptionUnavailableError();
  if (cache && cache.source === raw) return cache.key;
  // Any passphrase length is accepted; SHA-256 derives a fixed 32-byte AES key.
  const derived = crypto.createHash('sha256').update(raw, 'utf8').digest();
  cache = { source: raw, key: derived };
  return derived;
}

/**
 * AES-256-GCM. Output format: v1.<iv>.<authTag>.<ciphertext> (all base64).
 * Authenticated, so tampered ciphertext fails to decrypt instead of leaking data.
 */
export function encryptString(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    body.toString('base64'),
  ].join('.');
}

export function decryptString(payload: string | null | undefined): string {
  if (!payload) return '';
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Unsupported ciphertext format.');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(parts[1], 'base64'));
  decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(parts[3], 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
