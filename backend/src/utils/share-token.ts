import { randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

/** Generates a recipe share token. Stored raw, like the family invite token
 * (see utils/invite-token.ts): the owner's share dialog re-displays the same
 * link, and 256 random bits leave nothing to brute-force. */
export function generateShareToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}
