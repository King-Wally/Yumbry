import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function requireEncryptionKey(): Buffer {
  const key = process.env.AI_SETTINGS_ENCRYPTION_KEY;
  if (!key) throw new Error('AI_SETTINGS_ENCRYPTION_KEY must be set.');
  const buffer = Buffer.from(key, 'base64');
  if (buffer.length !== 32) {
    throw new Error('AI_SETTINGS_ENCRYPTION_KEY must decode to exactly 32 bytes (base64).');
  }
  return buffer;
}

const ENCRYPTION_KEY = requireEncryptionKey();

/** Encrypts a plaintext string, returning `iv:authTag:ciphertext` (each base64). */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/** Decrypts a string produced by encrypt(). Throws if the ciphertext or auth tag is invalid. */
export function decrypt(encoded: string): string {
  const [ivPart, authTagPart, ciphertextPart] = encoded.split(':');
  if (!ivPart || !authTagPart || !ciphertextPart) {
    throw new Error('Malformed encrypted value.');
  }
  const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, Buffer.from(ivPart, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagPart, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
