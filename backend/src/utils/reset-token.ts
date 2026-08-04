import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

/** Generates a new opaque reset token. The raw value is emailed to the user
 * and never stored; only its hash is persisted (see hashResetToken). */
export function generateResetToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

/** One-way hash of a reset token for storage/lookup — never store the raw
 * token itself, so a database read alone can't be used to reset a password. */
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
