import { randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

/** Generates a family invite token. Unlike a password reset token this one is
 * stored raw (see Family.inviteToken), because the settings page has to keep
 * re-displaying the same link — so there is no hash counterpart here. */
export function generateInviteToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}
